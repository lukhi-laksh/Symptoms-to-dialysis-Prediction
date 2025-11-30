import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import multer from "multer";
import { createRequire } from "module";
import dotenv from "dotenv";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  "AIzaSyDgVgK9WZqJp360L_tNQCr4aEyzm0_b1OY";
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.0-flash-lite-001";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
console.log("Using Gemini model:", GEMINI_MODEL);

app.use(cors());
app.use(express.json());
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024, // 8MB
  },
});

app.get("/", (_req, res) => {
  res.send("Disease Prediction backend is running.");
});

app.post("/api/predict", async (req, res) => {
  const { symptoms = "" } = req.body ?? {};
  if (!symptoms.trim()) {
    return res.status(400).json({ error: "Symptoms description is required." });
  }

  try {
    const response = await fetch(
      `${GEMINI_ENDPOINT}?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    "You are an experienced clinician.",
                    "Based ONLY on the provided symptoms:",
                    "- List likely conditions with likelihood (high/med/low).",
                    "- Flag red-flag signs needing urgent care.",
                    "- Provide pragmatic self-care guidance.",
                    "- Recommend appropriate specialist to contact and suggest next diagnostic tests if relevant.",
                    "- Note symptom duration/severity considerations or common triggers where applicable.",
                    "- Keep guidance practical, action-oriented, and avoid jargon.",
                    "Response format:",
                    "1. Brief reassurance / overall assessment.",
                    "2. Bulleted list of possible conditions with confidence.",
                    "3. Red-flag section (if none, state that).",
                    "4. Self-care + when to seek in-person care.",
                    "5. Specialist/test suggestions.",
                    "6. Disclaimer reminding that this is informational only.",
                    "Keep response under 220 words.",
                    `Symptoms: ${symptoms}`,
                  ].join("\n"),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.6,
            topK: 32,
            topP: 0.9,
            maxOutputTokens: 512,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      return res.status(502).json({
        error: "Gemini API request failed.",
        status: response.status,
        details: errorText,
      });
    }

    const data = await response.json();
    const text = extractGeminiText(data);

    if (!text) {
      console.warn("Gemini returned no text", {
        finishReason: data?.candidates?.[0]?.finishReason,
        safetyRatings: data?.candidates?.[0]?.safetyRatings,
      });
      if (process.env.NODE_ENV !== "production") {
        console.warn("Gemini raw payload snippet:", JSON.stringify(data, null, 2));
      }
      return res.json({
        result:
          "Gemini did not return any text. Adjust the description (avoid personal data) and try again.",
      });
    }

    res.json({ result: text });
  } catch (error) {
    console.error("Prediction error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.post(
  "/api/analyze-report",
  upload.single("report"),
  async (req, res) => {
    const { notes = "" } = req.body ?? {};
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "Report file is required." });
    }

    try {
      const reportText = await extractReportText(file);
      if (!reportText.trim()) {
        return res.status(400).json({
          error: "Unable to read content from the uploaded report.",
        });
      }

      const prompt = [
        "You are a clinical documentation specialist.",
        "Analyze the provided medical report text:",
        sanitizeReport(reportText),
        notes ? `Additional clinician notes: ${notes}` : "",
        "Summarize clearly with:",
        "- Key findings / impressions.",
        "- Diagnoses and differential ranked (high/med/low confidence).",
        "- Medications or labs mentioned.",
        "- Follow-up actions or referrals.",
        "Use plain, everyday language (around an 8th-grade reading level) so patients can easily understand.",
        "Keep the tone professional, concise, <= 250 words, and include a short disclaimer.",
      ]
        .filter(Boolean)
        .join("\n\n");

      const response = await fetch(
        `${GEMINI_ENDPOINT}?key=${encodeURIComponent(GEMINI_API_KEY)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.4,
              topK: 32,
              topP: 0.9,
              maxOutputTokens: 768,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          "Gemini report API error:",
          response.status,
          errorText
        );
        return res.status(502).json({
          error: "Gemini API request failed.",
          status: response.status,
          details: errorText,
        });
      }

      const data = await response.json();
      const text = extractGeminiText(data);

      if (!text) {
        return res.json({
          result:
            "Gemini did not return any summary text. Please try a shorter report or add clarifying notes.",
        });
      }

      res.json({ result: text });
    } catch (error) {
      console.error("Report analysis error:", error);
      const message =
        error?.message ||
        "Failed to analyze report. Please try a different file.";
      const statusCode =
        message.includes("Unable to read PDF") || message.includes("required")
          ? 422
          : 500;
      res.status(statusCode).json({ error: message });
    }
  }
);

function extractGeminiText(payload) {
  const candidates = payload?.candidates ?? [];
  const textParts = [];

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts ?? [];
    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.trim()) {
        textParts.push(part.text.trim());
      }
    }
  }

  return textParts.join("\n\n").trim();
}

async function extractReportText(file) {
  if (file.mimetype === "application/pdf") {
    const parser = new PDFParse({ data: file.buffer });
    try {
      const parsed = await parser.getText();
      return parsed?.text ?? "";
    } catch (error) {
      console.error("PDF parse failed:", error);
      throw new Error(
        "Unable to read PDF contents. The file may be scanned, encrypted, or corrupted."
      );
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  if (file.mimetype.startsWith("text/")) {
    return file.buffer.toString("utf-8");
  }

  throw new Error("Unsupported file type. Please upload PDF or text files.");
}

function sanitizeReport(text) {
  return text.replace(/\u0000/g, "").slice(0, 8000);
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

