import { useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const ACCEPTED_TYPES = ["application/pdf", "text/plain"];

function ReportPage() {
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [timestamp, setTimestamp] = useState("");

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0];
    if (!selected) {
      setFile(null);
      setStatus("");
      return;
    }

    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setError("Only PDF or plain text files are supported.");
      setFile(null);
      setStatus("");
      return;
    }

    setError("");
    setFile(selected);
    setStatus(`${selected.name} • ${(selected.size / 1024).toFixed(1)} KB`);
  };

  const resetForm = () => {
    setFile(null);
    setNotes("");
    setResult("");
    setError("");
    setStatus("");
    setTimestamp("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file) {
      setError("Upload a report file first.");
      return;
    }

    setIsLoading(true);
    setError("");
    setResult("");

    const formData = new FormData();
    formData.append("report", file);
    if (notes.trim()) {
      formData.append("notes", notes.trim());
    }

    try {
      const response = await fetch(`${API_BASE}/api/analyze-report`, {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          payload?.error ||
          `Report analysis failed (status ${response.status}).`;
        throw new Error(message);
      }

      setResult(payload.result ?? "No summary returned. Try again.");
      setTimestamp(new Date().toLocaleString());
    } catch (apiError) {
      setError(apiError.message ?? "Unexpected error. Please retry.");
    } finally {
      setIsLoading(false);
    }
  };

  const structuredReport = useMemo(
    () => buildReportStructure(result),
    [result]
  );

  return (
    <>
      <section className="page-intro">
        <h2>Report upload mode</h2>
        <p>
          Securely upload discharge notes, lab reports, or physician letters in
          PDF or text form. Gemini extracts the key findings, diagnoses, meds,
          and follow-up recommendations.
        </p>
      </section>

      <form className="report-form" onSubmit={handleSubmit}>
        <label className="upload-area">
          <span className="upload-title">
            {file ? "Report selected" : "Upload medical report"}
          </span>
          <span className="upload-hint">
            Accepted formats: PDF, TXT. Max 8 MB.
          </span>
          <input
            type="file"
            accept=".pdf,.txt,text/plain,application/pdf"
            onChange={handleFileChange}
            disabled={isLoading}
          />
          {status && <p className="upload-status">{status}</p>}
        </label>

        <label htmlFor="notes" className="upload-label">
          Optional clinician notes
        </label>
        <textarea
          id="notes"
          rows={4}
          placeholder="Add context such as reason for visit, prior conditions, or sections to focus on..."
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          disabled={isLoading}
        />

        <div className="form-actions">
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Analyzing..." : "Analyze report"}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={resetForm}
            disabled={isLoading && !file && !notes}
          >
            Reset
          </button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <article className="report-result-card">
          <div className="result-header">
            <div>
              <p className="eyebrow narrow">Report analysis</p>
              <h2>Summary</h2>
            </div>
            <span className="timestamp">{timestamp}</span>
          </div>

          {structuredReport.summaryTitle && (
            <p className="report-subtitle">{structuredReport.summaryTitle}</p>
          )}

          {structuredReport.intro.map((paragraph) => (
            <p className="report-intro" key={paragraph}>
              {paragraph}
            </p>
          ))}

          <div className="report-grid">
            <ReportSection
              title="Key Findings / Impressions"
              items={structuredReport.findings}
            />
            <ReportSection
              title="Diagnoses & Differential"
              items={structuredReport.diagnoses}
              tone="accent"
            />
            <ReportSection
              title="Medications / Labs"
              items={structuredReport.medications}
            />
            <ReportSection
              title="Follow-up Actions / Referrals"
              items={structuredReport.followups}
            />
          </div>

          {structuredReport.disclaimer && (
            <p className="disclaimer">{structuredReport.disclaimer}</p>
          )}
        </article>
      )}
    </>
  );
}

export default ReportPage;

function ReportSection({ title, items, tone = "default" }) {
  if (!items.length) return null;
  return (
    <section className={`report-section ${tone}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function buildReportStructure(rawText) {
  const base = {
    summaryTitle: "",
    intro: [],
    findings: [],
    diagnoses: [],
    medications: [],
    followups: [],
    disclaimer: "",
  };

  if (!rawText) return base;

  const lines = rawText.split(/\r?\n/).map((line) => line.trim());
  let section = "intro";

  for (const line of lines) {
    if (!line) continue;
    const newSection = resolveReportSection(line);
    if (newSection) {
      section = newSection;
      if (section === "summaryTitle") {
        base.summaryTitle = stripMarkers(line);
        section = "intro";
      }
      continue;
    }

    const content = stripMarkers(line);
    if (!content) continue;

    switch (section) {
      case "findings":
        base.findings.push(content);
        break;
      case "diagnoses":
        base.diagnoses.push(content);
        break;
      case "medications":
        base.medications.push(content);
        break;
      case "followups":
        base.followups.push(content);
        break;
      case "disclaimer":
        base.disclaimer += `${content} `;
        break;
      default:
        base.intro.push(content);
    }
  }

  base.disclaimer = base.disclaimer.trim();
  return base;
}

function resolveReportSection(line) {
  if (/^\*\*Summary/i.test(line)) return "summaryTitle";
  if (/key findings|impressions/i.test(line)) return "findings";
  if (/diagnoses|differential/i.test(line)) return "diagnoses";
  if (/medications|labs/i.test(line)) return "medications";
  if (/follow-up|follow up/i.test(line)) return "followups";
  if (/disclaimer/i.test(line)) return "disclaimer";
  return null;
}

function stripMarkers(text) {
  return text
    .replace(/^\*\*|\*\*$/g, "")
    .replace(/^\*\s*/, "")
    .replace(/^[\-\d\.\)]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

