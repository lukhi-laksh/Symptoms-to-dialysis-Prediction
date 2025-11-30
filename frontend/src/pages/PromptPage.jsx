import { useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

function PromptPage() {
  const [symptoms, setSymptoms] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [timestamp, setTimestamp] = useState("");

  const hasResult = Boolean(result?.trim());

  const structuredResult = useMemo(
    () => buildStructuredResult(result),
    [result]
  );
  const formattedResult = useMemo(() => {
    if (!hasResult) return [];
    return result
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);
  }, [result, hasResult]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!symptoms.trim()) {
      setError("Please describe at least one symptom.");
      return;
    }

    setIsLoading(true);
    setResult("");
    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ symptoms }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          payload?.error ||
          `Prediction failed (status ${response.status}). Try again.`;
        throw new Error(message);
      }

      setResult(payload.result ?? "No response generated. Please try again.");
      setTimestamp(new Date().toLocaleString());
    } catch (apiError) {
      setError(apiError.message ?? "Unexpected error. Please retry.");
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setSymptoms("");
    setResult("");
    setError("");
    setTimestamp("");
  };

  return (
    <>
      <section className="page-intro">
        <h2>Symptom prompt mode</h2>
        <p>
          Describe symptoms in free text. Gemini ranks likely conditions, flags
          red alerts, and suggests next steps in a triage-style layout.
        </p>
      </section>

      <form className="symptom-form" onSubmit={handleSubmit}>
        <label htmlFor="symptoms">Describe your symptoms</label>
        <textarea
          id="symptoms"
          name="symptoms"
          rows={6}
          placeholder="Example: Mild fever for 3 days, sore throat, swollen glands..."
          value={symptoms}
          onChange={(event) => setSymptoms(event.target.value)}
          disabled={isLoading}
          required
        />
        <div className="form-actions">
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Predicting..." : "Predict"}
          </button>
          <button
            type="button"
            onClick={resetForm}
            disabled={!symptoms || isLoading}
            className="ghost"
          >
            Clear
          </button>
        </div>
      </form>

      <section className="results" aria-live="polite">
        {!hasResult && !error && (
          <p className="placeholder">
            Results will summarize likely conditions, urgency flags, and next
            steps. Always consult a clinician for diagnosis or treatment.
          </p>
        )}

        {error && <p className="error">{error}</p>}

        {hasResult && (
          <>
            {structuredResult.conditions.length > 0 ? (
              <RankedConditionsView
                data={structuredResult}
                timestamp={timestamp}
                fallbackParagraphs={formattedResult}
              />
            ) : (
              <article className="result-card">
                <div className="result-body">
                  {formattedResult.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                <p className="disclaimer">
                  {structuredResult.disclaimer ||
                    "This information is educational and does not replace professional medical advice."}
                </p>
              </article>
            )}
          </>
        )}
      </section>
    </>
  );
}

export default PromptPage;

function RankedConditionsView({ data, timestamp, fallbackParagraphs }) {
  const summaryText =
    data.introParagraphs.join(" ") || fallbackParagraphs[0] || "";
  const summarySupporting = data.introParagraphs.slice(1);

  return (
    <section className="ranked-conditions-root">
      <article className="card rank-master" tabIndex={0}>
        <div className="rank-section">
          <div className="header">
            <div>
              <p className="eyebrow narrow">Latest analysis</p>
              <p className="title">Ranked Conditions</p>
            </div>
            <p className="subtitle">{timestamp}</p>
          </div>
          {summaryText && <p className="summary-text">{summaryText}</p>}
          {summarySupporting.map((paragraph) => (
            <p className="summary-text" key={paragraph}>
              {paragraph}
            </p>
          ))}
          <div className="meta-row">
            <span className="meta-pill">
              {data.conditions.length} possible condition
              {data.conditions.length === 1 ? "" : "s"}
            </span>
            <span className="meta-pill">
              {data.redFlags.length
                ? `${data.redFlags.length} red flag${
                    data.redFlags.length === 1 ? "" : "s"
                  }`
                : "No red flags highlighted"}
            </span>
          </div>
        </div>

        <div className="rank-section">
          <div className="header">
            <p className="title">2. Possible conditions</p>
            <p className="subtitle">Confidence badges</p>
          </div>
          <div className="conditions-list">
            {data.conditions.map((condition, index) => (
              <ConditionItem
                key={`${condition.title}-${index}`}
                condition={condition}
                index={index}
              />
            ))}
          </div>
        </div>

        <div className="rank-section redflags-card">
          <div className="header">
            <p className="title">3. Red flags</p>
            <p className="subtitle">Seek immediate care if these occur</p>
          </div>
          <div className="redflags-list">
            {data.redFlags.length ? (
              data.redFlags.map((flag) => (
                <div className="flag-item" key={flag}>
                  <span className="icon" role="img" aria-label="alert">
                    ⚠️
                  </span>
                  <div>
                    <p className="flag-text">{flag}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flag-item">
                <span className="icon" role="img" aria-label="info">
                  ✅
                </span>
                <div>
                  <p className="flag-text">No specific red flags called out.</p>
                  <p className="flag-desc">
                    Still seek care if symptoms worsen or new issues appear.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rank-section grid-2">
          <div>
            <p className="small-card-title">4. Self-care guidance</p>
            <div className="small-card-body">
              {data.selfCare.length ? (
                <ul>
                  {data.selfCare.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>Monitor symptoms closely and follow provider instructions.</p>
              )}
            </div>
          </div>

          <div>
            <p className="small-card-title">5. Specialist / tests</p>
            <div className="tests-list">
              {data.specialist.length ? (
                data.specialist.map((item) => (
                  <div className="test-item" key={item}>
                    <span className="bullet" />
                    <span>{item}</span>
                  </div>
                ))
              ) : (
                <p className="small-card-body">
                  Consult your primary care physician for tailored next steps.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rank-section">
          <p className="small-card-title">6. Disclaimer</p>
          <p className="disclaimer">
            {data.disclaimer ||
              "This information is for guidance only and does not replace professional medical advice."}
          </p>
        </div>
      </article>
    </section>
  );
}

function ConditionItem({ condition, index }) {
  const confidenceLabel =
    (condition.confidenceLabel || condition.confidenceText || "Est.")
      .toLowerCase()
      .trim();
  const meta = mapConfidenceMeta(confidenceLabel);

  return (
    <div className="condition-item">
      <div className="condition-left">
        <span className={`condition-dot ${meta.dotClass}`} />
        <div>
          <p className="condition-title">
            #{index + 1} {condition.title}
          </p>
          {condition.summary && (
            <p className="condition-desc">{condition.summary}</p>
          )}
          {condition.matching && (
            <p className="condition-desc">Matching: {condition.matching}</p>
          )}
        </div>
      </div>
      <span className={`condition-badge ${meta.badgeClass}`}>
        {meta.label}
      </span>
    </div>
  );
}

function mapConfidenceMeta(label) {
  if (label.includes("high")) {
    return {
      label: "High",
      badgeClass: "badge-high",
      dotClass: "dot-high",
    };
  }
  if (label.includes("med")) {
    return {
      label: "Med",
      badgeClass: "badge-med",
      dotClass: "dot-med",
    };
  }
  if (label.includes("low")) {
    return {
      label: "Low",
      badgeClass: "badge-low",
      dotClass: "dot-low",
    };
  }
  return {
    label: "Est.",
    badgeClass: "badge-med",
    dotClass: "dot-med",
  };
}


function buildStructuredResult(rawText) {
  const base = {
    introParagraphs: [],
    conditions: [],
    redFlags: [],
    selfCare: [],
    specialist: [],
    disclaimer: "",
  };

  if (!rawText) return base;

  const lines = rawText.split(/\r?\n/);
  let section = "intro";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const newSection = resolveSection(trimmed);
    if (newSection) {
      section = newSection;
      continue;
    }

    switch (section) {
      case "conditions":
        if (/^[-*•\d]/.test(trimmed)) {
          const parsed = parseCondition(trimmed);
          if (parsed) base.conditions.push(parsed);
        }
        break;
      case "redFlags":
        base.redFlags.push(cleanBullet(trimmed));
        break;
      case "selfCare":
        base.selfCare.push(cleanBullet(trimmed));
        break;
      case "specialist":
        base.specialist.push(cleanBullet(trimmed));
        break;
      case "disclaimer":
        base.disclaimer += `${cleanBullet(trimmed)} `;
        break;
      default:
        base.introParagraphs.push(cleanBullet(trimmed));
    }
  }

  base.disclaimer = base.disclaimer.trim();
  return base;
}

function resolveSection(line) {
  const checks = [
    { key: "conditions", regex: /likely conditions/i },
    { key: "redFlags", regex: /red flags/i },
    { key: "selfCare", regex: /self[-\s]?care|self[-\s]?monitor/i },
    { key: "specialist", regex: /specialist|doctor|clinician/i },
    { key: "disclaimer", regex: /disclaimer/i },
  ];

  return checks.find(({ regex }) => regex.test(line))?.key ?? null;
}

function parseCondition(line) {
  let body = cleanBullet(line);
  if (!body) return null;

  const confidenceMatch = body.match(/\*\*(.*?)\*\*/);
  let confidenceLabel = "";

  if (confidenceMatch) {
    confidenceLabel = confidenceMatch[1].replace(/[:]/g, "").trim();
    body = body.replace(confidenceMatch[0], "").trim();
  }

  body = body.replace(/^[:\-–—]\s*/, "");

  const [titlePart, ...rest] = body.split(/\s-\s/);
  const title = titlePart?.trim() || body;
  const summary = rest.join(" - ").trim();

  return {
    title,
    summary,
    confidenceLabel,
    confidencePercent: mapConfidence(confidenceLabel),
  };
}

function cleanBullet(text) {
  return text.replace(/^[-*•\d\.\)\s]+/, "").replace(/\s+/g, " ").trim();
}

function mapConfidence(label = "") {
  const normalized = label.toLowerCase();
  if (normalized.includes("high")) return 75;
  if (normalized.includes("medium") || normalized.includes("med")) return 55;
  if (normalized.includes("low")) return 35;
  return 60;
}

