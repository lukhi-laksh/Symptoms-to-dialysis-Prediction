const form = document.querySelector("#symptom-form");
const textarea = document.querySelector("#symptoms");
const submitBtn = document.querySelector("#submit-btn");
const results = document.querySelector("#results");
const resultTemplate = document.querySelector("#result-template");

const GEMINI_API_KEY = "Enter your Gemini Api key here";
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

const promptBoilerplate = `
You are an experienced clinician. Based ONLY on the provided symptoms:
- List likely conditions with likelihood (high/medium/low).
- Flag red-flag signs that require urgent medical care.
- Give practical self-care or monitoring advice.
- Recommend the type of doctor or service to contact.
Keep it concise (<= 200 words). Emphasize that this is informational only.
`;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const symptoms = textarea.value.trim();
  if (!symptoms) return;

  setLoading(true);

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
                { text: `${promptBoilerplate}\n\nSymptoms: ${symptoms}` },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.6,
            topK: 32,
            topP: 0.9,
            maxOutputTokens: 512,
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_NONE",
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error (${response.status})`);
    }

    const data = await response.json();
    const answer =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      "No response returned. Please try again.";

    renderResult(answer);
  } catch (error) {
    renderResult(
      `Unable to generate prediction right now.\n\nDetails: ${
        error.message ?? error
      }`
    );
    console.error(error);
  } finally {
    setLoading(false);
  }
});

function renderResult(text) {
  results.innerHTML = "";
  const clone = resultTemplate.content.cloneNode(true);
  const body = clone.querySelector(".result-body");
  const timestamp = clone.querySelector(".timestamp");
  body.innerHTML = formatMarkdownish(text);
  timestamp.textContent = new Date().toLocaleString();
  results.appendChild(clone);
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? "Predicting..." : "Predict";
}

function formatMarkdownish(text) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const withBreaks = escaped
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^\*\*?(.+?)\*\*?:?/gim, "<strong>$1</strong>")
    .replace(/^\-\s+(.*$)/gim, "• $1")
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br />");

  return `<p>${withBreaks}</p>`;
}

