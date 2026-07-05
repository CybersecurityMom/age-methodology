const MODULES = [
  {
    id: "purpose",
    title: "Purpose",
    subtitle: "Intent & audience",
    description: "Identifies why the document exists, the decision it supports, and its intended audience.",
    keywords: ["purpose", "objective", "intended", "audience", "aim", "designed to", "we publish"],
    questions: ["What decision is this document intended to support?", "Who is the intended audience, and how was that audience determined?"],
    gap: "The document’s intended use or audience is not clearly disclosed."
  },
  {
    id: "scope",
    title: "Scope",
    subtitle: "Coverage & exclusions",
    description: "Tests whether systems, lifecycle stages, geographies, and explicit exclusions are defined.",
    keywords: ["scope", "applies to", "covers", "excluded", "does not include", "boundary", "geograph", "lifecycle"],
    questions: ["Which systems, versions, markets, and lifecycle stages fall outside this document’s scope?", "How often is the stated scope reviewed or updated?"],
    gap: "Explicit boundaries and exclusions require additional detail."
  },
  {
    id: "evidence",
    title: "Evidence",
    subtitle: "Methods & measures",
    description: "Looks for methods, metrics, tests, references, results, and independent support for claims.",
    keywords: ["methodology", "method", "metric", "measured", "test", "evaluation", "benchmark", "result", "reference", "independent", "%", "score"],
    questions: ["Can the underlying test protocol, sample, thresholds, and complete results be provided?", "Were any claims independently validated? If so, by whom and against which standard?"],
    gap: "Claims would benefit from methods, quantitative results, and traceable references."
  },
  {
    id: "transparency",
    title: "Transparency",
    subtitle: "Disclosure quality",
    description: "Assesses clarity on data, design choices, known risks, change history, and access to supporting material.",
    keywords: ["disclose", "transparency", "data", "training", "source", "version", "change", "known risk", "public", "available"],
    questions: ["Which material facts were withheld, summarized, or unavailable for public disclosure?", "Where can reviewers access version history and supporting artifacts?"],
    gap: "Some material facts or supporting artifacts are not clearly available."
  },
  {
    id: "governance",
    title: "Governance",
    subtitle: "Controls & ownership",
    description: "Searches for human oversight, accountability, monitoring, risk management, bias mitigation, and documentation controls.",
    keywords: ["human oversight", "accountab", "monitor", "risk management", "bias", "fairness", "governance", "owner", "responsib", "escalat", "control", "review committee"],
    questions: ["Who is accountable for accepting residual risk, and what escalation path applies?", "What monitoring triggers review, intervention, or system withdrawal?"],
    gap: "Control ownership, escalation, and ongoing monitoring need fuller disclosure."
  },
  {
    id: "limitations",
    title: "Limitations",
    subtitle: "Assumptions & bounds",
    description: "Identifies disclosed limitations, assumptions, uncertainty, prohibited uses, and performance boundaries.",
    keywords: ["limitation", "assumption", "uncertain", "may not", "should not", "not intended", "constraint", "boundary", "caveat", "failure"],
    questions: ["How were the disclosed limitations discovered, tested, and communicated to affected users?", "What assumptions could materially change the document’s conclusions?"],
    gap: "Limitations, assumptions, or conditions of validity are not sufficiently explicit."
  }
];

const SAMPLE = `Public Responsible AI Assessment Summary: Example

Purpose and scope
This statement is intended to explain our governance approach for the Acme Assist text-generation system, version 2.1, deployed in the United States and Canada. It covers product design, pre-deployment testing, and post-launch monitoring. It does not evaluate third-party integrations or customer-configured retrieval data.

Evidence and evaluation
Our evaluation methodology includes red-team testing, bias evaluation, privacy review, and task-specific quality benchmarks. The model was evaluated on 12,500 prompts. Harmful-response rate was measured at 1.8% against a pre-release threshold of 2.5%. A summary of benchmark definitions is available in the referenced System Evaluation Guide. An independent assessor reviewed the testing process, but the complete report is not public.

Transparency and governance
Training data sources include licensed, public, and human-generated datasets. Exact dataset composition is not disclosed because of contractual restrictions. The Responsible AI Council approves high-risk releases. Product owners are accountable for remediation. Human reviewers investigate flagged outputs, and automated monitoring tracks harmful content and performance drift monthly. Material incidents follow the enterprise risk escalation process.

Limitations
The system may produce inaccurate or biased content and should not be used as the sole basis for medical, legal, employment, or credit decisions. Evaluation results may not generalize to languages other than English. Testing assumes standard product settings and does not cover user modifications. This statement will be reviewed annually.`;

const els = {
  text: document.querySelector("#document-text"),
  title: document.querySelector("#document-title"),
  type: document.querySelector("#document-type"),
  url: document.querySelector("#document-url"),
  file: document.querySelector("#document-file"),
  count: document.querySelector("#char-count"),
  analyze: document.querySelector("#analyze-button"),
  validation: document.querySelector("#validation-message"),
  inputState: document.querySelector("#input-state"),
  resultsState: document.querySelector("#results-state")
};
let lastReview = null;
let currentSource = "Pasted text";
let currentExtractionStats = { characters: 0, tables: 0, images: 0, primary: false };
const HISTORY_KEY = "age-review-history-v1";

function renderFramework() {
  const allModules = [...MODULES, { title: "Follow-up", subtitle: "Questions & next steps", description: "Turns evidence gaps into focused questions and recommended artifacts." }];
  document.querySelector("#lens-list").innerHTML = allModules.map((m, i) => `
    <div class="lens-item">
      <span class="lens-number">${String(i + 1).padStart(2, "0")}</span>
      <div><strong>${m.title}</strong><small>${m.subtitle}</small></div><span>›</span>
    </div>`).join("");
  document.querySelector("#methodology-detail").innerHTML = allModules.map((m, i) => `
    <div class="method-row"><span class="lens-number">${String(i + 1).padStart(2, "0")}</span><div><h3>${m.title}</h3><span class="step-label">${m.subtitle}</span></div><p>${m.description}</p></div>
  `).join("");
}

function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, " ");
}

function extractHtmlDocument(html) {
  const documentNode = new DOMParser().parseFromString(html, "text/html");
  documentNode.querySelectorAll([
    "script", "style", "noscript", "nav", "header", "footer", "form", "svg",
    "[role='navigation']", "[role='banner']", "[role='contentinfo']",
    "[class*='cookie']", "[id*='cookie']", "[class*='consent']", "[id*='consent']",
    "[class*='breadcrumb']", "[class*='login']", "[class*='newsletter']",
    "[aria-label*='cookie' i]", "[aria-label*='navigation' i]"
  ].join(",")).forEach(node => node.remove());

  const tableCount = documentNode.querySelectorAll("table").length;
  const imageCount = documentNode.querySelectorAll("img").length;
  documentNode.querySelectorAll("table").forEach((table, tableIndex) => {
    const rows = [...table.querySelectorAll("tr")];
    const headers = [...(rows[0]?.querySelectorAll("th,td") || [])].map(cell => cell.textContent.trim());
    const tableText = rows.map((row, rowIndex) => {
      const cells = [...row.querySelectorAll("th,td")].map(cell => cell.textContent.replace(/\s+/g, " ").trim());
      if (!cells.length) return "";
      if (rowIndex === 0) return `Columns: ${cells.join(" | ")}`;
      return cells.map((cell, index) => `${headers[index] || `Column ${index + 1}`}: ${cell}`).join(" | ");
    }).filter(Boolean).join("\n");
    const replacement = documentNode.createElement("div");
    replacement.textContent = `\nTABLE ${tableIndex + 1}\n${tableText}\nEND TABLE\n`;
    table.replaceWith(replacement);
  });

  const candidates = [
    ...documentNode.querySelectorAll("main, article, [role='main'], .article, .article-content, .content, .main-content")
  ].filter(node => node.innerText.trim().length >= 200);
  const primaryNode = candidates.sort((a, b) => b.innerText.length - a.innerText.length)[0];
  const sourceText = (primaryNode || documentNode.body).innerText;
  const boilerplatePatterns = [
    /^(sign in|log in|accept all|reject all|manage preferences|privacy choices|skip to content)$/i,
    /^(home|about|contact|careers|search|menu)$/i,
    /^(copyright|all rights reserved|follow us)/i,
    /^(cookie|this website uses cookies)/i
  ];
  const text = sourceText
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !boilerplatePatterns.some(pattern => pattern.test(line)))
    .join("\n")
    .trim();
  const title = documentNode.querySelector("meta[property='og:title']")?.content
    || documentNode.querySelector("h1")?.textContent.trim()
    || documentNode.title.trim();
  return { text, title, tables: tableCount, images: imageCount, primary: Boolean(primaryNode) };
}

function htmlToEvidenceText(html) {
  return extractHtmlDocument(html).text;
}

function showImportStats(stats) {
  currentExtractionStats = stats;
  document.querySelector("#import-summary").classList.remove("hidden");
  document.querySelector("#import-stats").innerHTML = [
    stats.primary ? "Primary content extracted" : "Readable document content extracted",
    `Approximately ${stats.characters.toLocaleString()} characters analyzed`,
    `${stats.tables} table${stats.tables === 1 ? "" : "s"} detected`,
    `${stats.images} image${stats.images === 1 ? "" : "s"} detected`
  ].map(item => `<span>${item}</span>`).join("");
}

function setDocumentText(text, sourceLabel, stats = null) {
  els.text.value = text;
  els.text.dispatchEvent(new Event("input"));
  if (!els.title.value && sourceLabel) els.title.value = sourceLabel;
  if (stats) showImportStats(stats);
}

function normalizePublicUrl(value) {
  let candidate = value.trim();
  const markdownLink = candidate.match(/^\[[^\]]*]\((https?:\/\/[^)]+)\)$/i);
  if (markdownLink) candidate = markdownLink[1];
  candidate = candidate.replace(/^<|>$/g, "").trim();
  if (candidate.startsWith("//")) candidate = `https:${candidate}`;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;

  const parsed = new URL(candidate);
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error("Use a public HTTP or HTTPS webpage address.");
  }
  parsed.hash = "";
  return parsed;
}

async function importUrl() {
  const status = document.querySelector("#url-status");
  let url;
  try {
    url = normalizePublicUrl(els.url.value);
    els.url.value = url.href;
  } catch (error) {
    status.className = "source-status error";
    status.textContent = error.message || "Enter a valid public webpage address.";
    return;
  }

  status.className = "source-status";
  status.textContent = "Reading the public webpage…";
  document.querySelector("#import-url").disabled = true;
  try {
    let html;
    let readerText = "";
    let importMethod = "directly";
    let usedServerReader = false;
    try {
      const directResponse = await fetch(url.href);
      if (!directResponse.ok) throw new Error(`Status ${directResponse.status}`);
      html = await directResponse.text();
    } catch {
      status.textContent = "The website blocked direct access. Trying the secure webpage reader…";
      const readerResponse = await fetch(`/api/fetch-url?url=${encodeURIComponent(url.href)}`);
      const payload = await readerResponse.json().catch(() => ({}));
      if (!readerResponse.ok) {
        if (readerResponse.status === 404) throw new Error("The webpage reader is not running. Restart AGE with python3 server.py.");
        status.textContent = "Direct reading was blocked. Trying the rendered webpage…";
        const renderedResponse = await fetch(`/api/render-url?url=${encodeURIComponent(url.href)}`);
        const renderedPayload = await renderedResponse.json().catch(() => ({}));
        if (renderedResponse.ok && renderedPayload.html) {
          html = renderedPayload.html;
          importMethod = "through the rendered-page reader";
        } else {
          status.textContent = "The website requires verification. Trying the public text reader…";
          const textResponse = await fetch(`/api/read-url?url=${encodeURIComponent(url.href)}`);
          const textPayload = await textResponse.json().catch(() => ({}));
          if (!textResponse.ok || !textPayload.text) {
            throw new Error(textPayload.error || renderedPayload.error || payload.error || "The webpage could not be read.");
          }
          readerText = textPayload.text;
          html = "";
          importMethod = "through the public text reader";
        }
      } else {
        html = payload.html;
        importMethod = "through the secure webpage reader";
        usedServerReader = true;
      }
    }
    const readerTitle = readerText.match(/^Title:\s*(.+)$/im)?.[1]?.trim() || "";
    let extraction = html ? extractHtmlDocument(html) : { text: readerText, title: readerTitle, tables: 0, images: 0, primary: true };
    let extracted = readerText || extraction.text;
    let detectedImages = extraction.images;
    let detectedTables = extraction.tables;
    let primaryExtracted = extraction.primary;
    let renderNote = "";

    if (usedServerReader) {
      status.textContent = "Checking for interactive text and tables…";
      try {
        const renderedResponse = await fetch(`/api/render-url?url=${encodeURIComponent(url.href)}`);
        const renderedPayload = await renderedResponse.json().catch(() => ({}));
        if (renderedResponse.ok && renderedPayload.html) {
          const imageEvidence = (renderedPayload.imageEvidence || [])
            .map((item, index) => `IMAGE EVIDENCE ${index + 1}: ${item.label}\n${item.text}\nEND IMAGE EVIDENCE`)
            .join("\n\n");
          const renderedExtraction = extractHtmlDocument(renderedPayload.html);
          const renderedText = `${renderedExtraction.text}${imageEvidence ? `\n\n${imageEvidence}` : ""}`;
          const staticTables = (extracted.match(/\bTABLE \d+\b/g) || []).length;
          const renderedTables = (renderedText.match(/\bTABLE \d+\b/g) || []).length;
          if (renderedText.length > extracted.length + 100 || renderedTables > staticTables) {
            extracted = renderedText;
            detectedTables = renderedExtraction.tables;
            detectedImages = Math.max(renderedExtraction.images, renderedPayload.imageEvidence?.length || 0);
            primaryExtracted = renderedExtraction.primary;
            importMethod = "through the rendered-page reader";
            renderNote = imageEvidence
              ? ` ${renderedPayload.imageEvidence.length} image-based evidence item${renderedPayload.imageEvidence.length === 1 ? "" : "s"} identified; upload the image or CSV for exact rows.`
              : renderedTables
              ? ` ${renderedTables} rendered table${renderedTables === 1 ? "" : "s"} captured.`
              : " Interactive page content was included.";
          }
        } else if (renderedPayload.error) {
          renderNote = " The standard public document was imported; rendered content was unavailable.";
        }
      } catch {
        renderNote = " The standard public document was imported; interactive content may require a file upload.";
      }
    }

    if (extracted.length < 200) throw new Error("The webpage did not contain enough readable article text.");
    currentSource = url.href;
    setDocumentText(extracted, extraction.title || readerTitle || url.hostname, {
      characters: extracted.length,
      tables: detectedTables,
      images: detectedImages,
      primary: primaryExtracted
    });
    status.className = "source-status success";
    status.textContent = `Imported ${extracted.length.toLocaleString()} characters ${importMethod}.${renderNote}`;
  } catch (error) {
    status.className = "source-status error";
    status.textContent = `${error.message} You can also save the webpage as an HTML file and upload it.`;
  } finally {
    document.querySelector("#import-url").disabled = false;
  }
}

async function importFile(file) {
  const status = document.querySelector("#file-status");
  if (!file) return;
  const extension = file.name.split(".").pop().toLowerCase();
  if (!["html", "htm", "txt", "md", "csv"].includes(extension)) {
    status.className = "source-status error";
    status.textContent = "Please choose an HTML, TXT, Markdown, or CSV file.";
    return;
  }
  try {
    const raw = await file.text();
    const extraction = ["html", "htm"].includes(extension)
      ? extractHtmlDocument(raw)
      : { text: raw, tables: extension === "csv" ? 1 : 0, images: 0, primary: false };
    const text = extraction.text;
    if (text.trim().length < 200) throw new Error("This file does not contain enough readable text.");
    currentSource = file.name;
    setDocumentText(text.trim(), file.name.replace(/\.[^.]+$/, ""), {
      characters: text.trim().length,
      tables: extraction.tables,
      images: extraction.images,
      primary: extraction.primary
    });
    status.className = "source-status success";
    status.textContent = `${file.name} imported successfully (${text.trim().length.toLocaleString()} characters).`;
  } catch (error) {
    status.className = "source-status error";
    status.textContent = error.message;
  }
}

function sentences(text) {
  return text.replace(/\n+/g, " ").split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 25);
}

function analyzeModule(module, text) {
  const lower = normalize(text);
  const found = module.keywords.filter(k => lower.includes(k));
  const evidenceSentences = sentences(text).filter(sentence =>
    module.keywords.some(keyword => sentence.toLowerCase().includes(keyword))
  ).slice(0, 2);
  const ratio = found.length / module.keywords.length;
  const score = Math.min(100, Math.round((ratio * 120) + (evidenceSentences.length * 8)));
  const status = score >= 60 ? "strong" : score >= 28 ? "partial" : "gap";
  const statusLabel = status === "strong" ? "Clearly stated" : status === "partial" ? "Some detail found" : "Not found in text";
  let finding;
  if (status === "strong") finding = `The provided text states substantive information about ${module.title.toLowerCase()}.`;
  else if (status === "partial") finding = `The document appears to address ${module.title.toLowerCase()}, though additional documentation may be needed for a more complete review.`;
  else finding = `${module.title} information was not found in the provided text. This does not establish that the information or practice does not exist.`;
  return { ...module, found, evidenceSentences, score, status, statusLabel, finding };
}

function analyzeDocument() {
  const text = els.text.value.trim();
  if (!currentExtractionStats.characters) {
    currentExtractionStats = {
      characters: text.length,
      tables: (text.match(/\bTABLE \d+\b/g) || []).length,
      images: (text.match(/\bIMAGE EVIDENCE \d+\b/g) || []).length,
      primary: false
    };
  }
  const results = MODULES.map(module => analyzeModule(module, text));
  const strong = results.filter(r => r.status === "strong");
  const gaps = results.filter(r => r.status !== "strong");
  const scores = buildDocumentationScores(results);
  lastReview = buildGovernanceBrief(text, results, scores);
  lastReview.id = `${Date.now()}`;
  lastReview.date = new Date().toISOString();
  lastReview.source = currentSource;
  lastReview.text = text.slice(0, 150000);
  lastReview.results = results;
  lastReview.extractionStats = currentExtractionStats;
  renderResults(results, scores, strong, gaps, lastReview);
  saveReview(lastReview);
  els.inputState.classList.add("hidden");
  els.resultsState.classList.remove("hidden");
  document.querySelectorAll(".workflow-step").forEach(step => step.classList.add("active"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function buildDocumentationScores(results) {
  const byId = Object.fromEntries(results.map(result => [result.id, result]));
  const scoreItems = [
    { title: "Scope Clarity", score: byId.scope.score, explanation: scoreExplanation(byId.scope.score, "systems, boundaries, coverage, and exclusions") },
    { title: "Evidence Quality", score: byId.evidence.score, explanation: scoreExplanation(byId.evidence.score, "claims, methods, metrics, results, and references") },
    { title: "Transparency", score: byId.transparency.score, explanation: scoreExplanation(byId.transparency.score, "data, risks, sources, versions, and supporting information") },
    { title: "Governance Detail", score: byId.governance.score, explanation: scoreExplanation(byId.governance.score, "oversight, accountability, monitoring, and risk controls") },
    { title: "Limitations Disclosure", score: byId.limitations.score, explanation: scoreExplanation(byId.limitations.score, "assumptions, exclusions, uncertainty, and boundaries") }
  ];
  return { items: scoreItems, overall: Math.round(scoreItems.reduce((sum, item) => sum + item.score, 0) / scoreItems.length) };
}

function scoreExplanation(score, subject) {
  if (score >= 70) return `The provided text gives relatively clear detail on ${subject}.`;
  if (score >= 40) return `Some detail on ${subject} was found; additional documentation may be needed.`;
  return `Limited detail on ${subject} was found in the provided text.`;
}

function missingEvidence(result, checks) {
  const lowerFound = result.found.join(" ");
  return checks.filter(check => !check.terms.some(term => lowerFound.includes(term))).map(check => check.label);
}

function buildGovernanceBrief(text, results, scores) {
  const byId = Object.fromEntries(results.map(result => [result.id, result]));
  const signalLabels = {
    purpose: "purpose",
    objective: "objectives",
    intended: "intended use",
    audience: "intended audience",
    "designed to": "design intent",
    scope: "scope",
    "applies to": "applicability",
    covers: "coverage",
    excluded: "exclusions",
    "does not include": "exclusions",
    boundary: "boundaries",
    geograph: "geographic coverage",
    lifecycle: "lifecycle coverage",
    methodology: "methodology",
    method: "methods",
    metric: "metrics",
    measured: "measurements",
    test: "testing",
    evaluation: "evaluations",
    benchmark: "benchmarks",
    result: "results",
    reference: "supporting references",
    independent: "independent review",
    disclose: "disclosures",
    transparency: "transparency",
    data: "data",
    training: "training information",
    source: "sources",
    version: "version information",
    "known risk": "known risks",
    "human oversight": "human oversight",
    accountab: "accountability",
    monitor: "monitoring",
    "risk management": "risk management",
    bias: "bias mitigation",
    fairness: "fairness",
    governance: "governance",
    owner: "control ownership",
    responsib: "responsibility",
    escalat: "escalation",
    limitation: "limitations",
    assumption: "assumptions",
    uncertain: "uncertainty",
    "not intended": "use restrictions",
    constraint: "constraints",
    caveat: "caveats"
  };
  const disclosedSignals = result => [...new Set(result.found
    .map(signal => signalLabels[signal])
    .filter(Boolean))]
    .slice(0, 6);
  const observation = (result, subject) => {
    if (!result.found.length) return `Not found in the provided documentation: clear information about ${subject}.`;
    const signals = disclosedSignals(result);
    const detail = signals.length ? ` Specifically, the text mentions ${joinNatural(signals)}.` : "";
    if (result.status === "strong") return `The provided documentation gives clear information about ${subject}.${detail}`;
    return `The provided documentation contains some information about ${subject}.${detail} Additional detail may be available in supporting documentation.`;
  };
  const scopeMissing = missingEvidence(byId.scope, [
    { label: "Not found in the provided documentation: a clear definition of the systems or model versions covered.", terms: ["applies to", "covers"] },
    { label: "Not found in the provided documentation: explicit exclusions.", terms: ["excluded", "does not include"] },
    { label: "Not found in the provided documentation: geographic or lifecycle boundaries.", terms: ["geograph", "lifecycle"] }
  ]);
  const evidenceMissing = missingEvidence(byId.evidence, [
    { label: "Not found in the provided documentation: a detailed assessment methodology.", terms: ["methodology", "method"] },
    { label: "Not found in the provided documentation: quantitative metrics or results.", terms: ["metric", "measured", "result", "%", "score"] },
    { label: "Not found in the provided documentation: traceable supporting references.", terms: ["reference"] },
    { label: "Not found in the provided documentation: an independent assessment.", terms: ["independent"] }
  ]);
  return {
    title: els.title.value.trim() || `${els.type.value} review`,
    type: els.type.value,
    scores,
    sections: [
      { label: "Purpose", title: "Document Purpose", kind: "found", note: "What the documentation appears designed to communicate and who it is intended to inform.", text: observation(byId.purpose, "its purpose, intended use, or audience") },
      { label: "Scope disclosed", title: "Scope Disclosed", kind: "found", note: "Scope information AGE found in the provided documentation.", items: [observation(byId.scope, "coverage, boundaries, or exclusions")] },
      { label: "Scope gaps", title: "Scope Details Not Found", kind: "not-found", note: "Specific scope details not found in the provided documentation. This does not mean they do not exist elsewhere.", items: scopeMissing.length ? scopeMissing : ["No additional configured scope categories were identified as missing. Supporting documentation may still provide more detail."] },
      { label: "Evidence disclosed", title: "Evidence Disclosed", kind: "found", note: "Methods, measures, results, references, or review practices AGE found in the documentation.", items: [observation(byId.evidence, "methods, metrics, tests, results, references, or independent review")] },
      { label: "Evidence gaps", title: "Additional Evidence Not Found", kind: "not-found", note: "AGE found some evidence in the document. The items below are specific evidence categories not found in the provided documentation.", items: evidenceMissing.length ? evidenceMissing : ["No additional configured evidence categories were identified as missing. The quality and operating effectiveness of the disclosed evidence have not been verified."] },
      { label: "Transparency", title: "Transparency Observations", kind: "observation", note: "What the document makes visible and where supporting documentation may provide more context.", text: `${observation(byId.transparency, "data, sources, risks, versions, or supporting information")} ${byId.transparency.gap}` },
      { label: "Governance", title: "Governance Controls Mentioned", kind: "found", note: "Oversight, accountability, monitoring, risk, or documentation practices mentioned in the provided documentation.", items: [observation(byId.governance, "human oversight, accountability, monitoring, risk management, or documentation controls")] },
      { label: "Limitations", title: "Limitations and Boundaries", kind: "observation", note: "Disclosed assumptions, exclusions, uncertainty, prohibited uses, or conditions affecting interpretation.", items: [observation(byId.limitations, "assumptions, limitations, exclusions, uncertainty, or prohibited uses")] }
    ],
    questions: buildQuestions(results),
    nextDocuments: recommendDocuments(results, els.type.value)
  };
}

function buildQuestions(results) {
  const byId = Object.fromEntries(results.map(result => [result.id, result]));
  const questions = [];
  if (byId.scope.status !== "strong") questions.push("Which document defines the systems, versions, geographies, lifecycle stages, and exclusions covered by this disclosure?");
  if (byId.evidence.status !== "strong") questions.push("Where can a reviewer find the complete methodology, sample description, thresholds, metrics, and underlying results?");
  if (!byId.evidence.found.includes("independent")) questions.push("Is there an independent assessment, assurance report, or audit that supports the stated claims?");
  if (byId.transparency.status !== "strong") questions.push("Which supporting artifacts provide data provenance, version history, known risks, and material changes?");
  if (byId.governance.status !== "strong") questions.push("Which governance document identifies accountable owners, approval authority, monitoring cadence, and escalation procedures?");
  if (byId.limitations.status !== "strong") questions.push("Where are assumptions, known limitations, prohibited uses, and conditions affecting validity documented?");
  questions.push("What is the next document in the evidence chain that would allow a reviewer to verify these disclosures?");
  return questions.slice(0, 7);
}

function renderResults(results, scores, strong, gaps, brief) {
  const suppliedTitle = els.title.value.trim() || `${els.type.value} review`;
  document.querySelector("#results-title").textContent = suppliedTitle;
  document.querySelector("#overall-score").textContent = scores.overall;
  document.querySelector("#score-bar").style.width = `${scores.overall}%`;
  document.querySelector("#score-description").textContent =
    scores.overall >= 70 ? "The provided documentation is comparatively detailed across the assessed evidence domains."
    : scores.overall >= 40 ? "The provided documentation contains useful detail, with several areas requiring additional documentation."
    : "The provided text contains limited documentation across the assessed evidence domains.";
  const strengthText = strong.length
    ? `The document appears strongest in its discussion of ${joinNatural(strong.map(r => r.title.toLowerCase()))}.`
    : "No evidence domain reached the clear-disclosure threshold in the provided text.";
  const gapText = gaps.length
    ? `Additional documentation may be needed for ${joinNatural(gaps.slice(0, 3).map(r => r.title.toLowerCase()))}.`
    : "All configured domains contain meaningful disclosure, though supporting source documents should still be reviewed.";
  const executiveSummary = `${strengthText} ${gapText} This brief assesses documentation completeness only and does not determine whether the AI system is fair, compliant, safe, or trustworthy. This review reflects only the documentation analyzed. Additional governance documentation may provide important context.`;
  document.querySelector("#executive-summary").textContent = executiveSummary;
  brief.executiveSummary = executiveSummary;

  document.querySelector("#documentation-scores").innerHTML = scores.items.map(item => `
    <article class="documentation-score">
      <div class="documentation-score-head"><h4>${item.title}</h4><strong>${item.score}</strong></div>
      <p>${item.explanation}</p>
      <div class="mini-bar"><span style="width:${item.score}%"></span></div>
    </article>`).join("");

  document.querySelector("#results-grid").innerHTML = brief.sections.map(section => `
    <article class="brief-section ${section.kind} ${["Document Purpose", "Transparency Observations"].includes(section.title) ? "wide" : ""}">
      <div class="brief-section-head">
        <span class="domain-label">${section.label}</span>
        <h3>${section.title}</h3>
      </div>
      ${section.note ? `<p class="section-note">${escapeHtml(section.note)}</p>` : ""}
      ${section.text ? `<p>${escapeHtml(section.text)}</p>` : `<ul class="evidence-list">${section.items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`}
    </article>`).join("");

  document.querySelector("#questions-list").innerHTML = brief.questions.map(question => `<li>${question}</li>`).join("");

  document.querySelector("#next-documents").innerHTML = brief.nextDocuments.map(doc => `
    <div class="next-doc"><strong>${doc.title}</strong><small>${doc.reason}</small></div>`).join("");
}

function recommendDocuments(results, documentType) {
  const byId = Object.fromEntries(results.map(r => [r.id, r]));
  const typeRecommendations = {
    "Responsible AI statement": [
      ["Model Card", "Review model purpose, evaluation evidence, intended use, and limitations."],
      ["System Card", "Review system-level architecture, safeguards, deployment context, and boundaries."],
      ["Independent Assessment", "Locate external evaluation methods, findings, and supporting evidence."],
      ["Privacy Documentation", "Review data processing, retention, access, and privacy controls."]
    ],
    "Independent AI assessment": [
      ["Methodology Appendix", "Review sampling, comparison methods, thresholds, assumptions, and complete results."],
      ["Model Card", "Connect assessment findings to model purpose, evaluation, and limitations."],
      ["Trust Center", "Locate related security, privacy, compliance, and assurance documentation."],
      ["Risk Management Documentation", "Review risk ownership, treatment, monitoring, and escalation."]
    ],
    "Model card": [
      ["System Card", "Connect model-level evidence to the deployed system and its safeguards."],
      ["Evaluation Reports", "Review complete test methods, datasets, thresholds, and results."],
      ["Risk Documentation", "Review identified risks, controls, residual risk, and monitoring."]
    ]
  };
  const recommendations = (typeRecommendations[documentType] || []).map(([title, reason]) => ({ title, reason }));
  if (!recommendations.length) {
    if (byId.evidence.status !== "strong") recommendations.push({ title: "Evaluation or assessment report", reason: "Review methods, thresholds, metrics, findings, and supporting references." });
    if (byId.governance.status !== "strong") recommendations.push({ title: "AI governance and risk documentation", reason: "Clarify accountability, oversight, monitoring, escalation, and risk controls." });
    if (byId.limitations.status !== "strong") recommendations.push({ title: "Model card or system card", reason: "Review intended use, limitations, assumptions, and system boundaries." });
    recommendations.push({ title: "Privacy or data governance documentation", reason: "Review data provenance, processing, retention, and access controls." });
  }
  return recommendations.slice(0, 5);
}

function joinNatural(items) {
  if (items.length < 2) return items[0] || "";
  if (items.length === 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}

function getReviewHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveReview(review) {
  const history = getReviewHistory().filter(item => item.id !== review.id);
  history.unshift(review);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
  } catch {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 3)));
  }
  renderHistory();
}

function renderHistory() {
  const history = getReviewHistory();
  const list = document.querySelector("#history-list");
  const empty = document.querySelector("#history-empty");
  document.querySelector(".history-page").classList.toggle("hidden", history.length === 0);
  empty.classList.toggle("hidden", history.length > 0);
  list.innerHTML = history.map(review => `
    <article class="history-card">
      <div><strong>${escapeHtml(review.title)}</strong><small>${escapeHtml(review.source || "Pasted text")}</small></div>
      <div><strong>${escapeHtml(review.type)}</strong><small>Document type</small></div>
      <div><strong>${new Date(review.date).toLocaleDateString()}</strong><small>Review date</small></div>
      <div><span class="history-score">${review.scores.overall}</span><small>Completeness / 100</small></div>
      <button class="button secondary reopen-review" data-review-id="${review.id}">Reopen review</button>
    </article>`).join("");
}

function reopenReview(reviewId) {
  const review = getReviewHistory().find(item => item.id === reviewId);
  if (!review) return;
  els.title.value = review.title;
  els.type.value = review.type;
  els.text.value = review.text || "";
  const refreshedBrief = buildGovernanceBrief(review.text || "", review.results, review.scores);
  lastReview = { ...review, ...refreshedBrief };
  currentSource = review.source || "Pasted text";
  currentExtractionStats = review.extractionStats || { characters: review.text?.length || 0, tables: 0, images: 0, primary: false };
  els.text.dispatchEvent(new Event("input"));
  const strong = review.results.filter(result => result.status === "strong");
  const gaps = review.results.filter(result => result.status !== "strong");
  renderResults(review.results, review.scores, strong, gaps, lastReview);
  switchView("workspace");
  els.inputState.classList.add("hidden");
  els.resultsState.classList.remove("hidden");
  document.querySelectorAll(".workflow-step").forEach(step => step.classList.add("active"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetReview() {
  els.text.value = "";
  els.title.value = "";
  els.count.textContent = "0 characters";
  els.analyze.disabled = true;
  currentSource = "Pasted text";
  currentExtractionStats = { characters: 0, tables: 0, images: 0, primary: false };
  document.querySelector("#import-summary").classList.add("hidden");
  els.inputState.classList.remove("hidden");
  els.resultsState.classList.add("hidden");
  document.querySelectorAll(".workflow-step").forEach((step, i) => step.classList.toggle("active", i === 0));
}

function formatBrief(markdown = true) {
  if (!lastReview) return "";
  const heading = title => markdown ? `## ${title}` : title.toUpperCase();
  const scores = lastReview.scores.items.map(item => `${item.title}: ${item.score}/100 - ${item.explanation}`).join("\n");
  const sections = lastReview.sections.map(section => {
    const content = section.text || section.items.map(item => `- ${item}`).join("\n");
    return `${heading(section.title)}\n${content}`;
  }).join("\n\n");
  const questions = lastReview.questions.map((question, index) => `${index + 1}. ${question}`).join("\n");
  const documents = lastReview.nextDocuments.map(document => `- ${document.title}: ${document.reason}`).join("\n");
  return `${markdown ? "# " : ""}AGE Governance Evidence Brief

Created by AQ’S Corner LLC as part of the AI Governance Evidence (AGE) Methodology project.
Version 1.0

Document: ${lastReview.title}
Document type: ${lastReview.type}
Generated: ${new Date().toLocaleDateString()}

EVIDENCE BOUNDARY
AGE evaluates only the text provided. An absent disclosure should be treated as “not found in the provided text,” not as proof that the evidence does not exist.

${heading("Documentation Completeness")}
Overall Documentation Completeness: ${lastReview.scores.overall}/100
These scores evaluate the completeness and clarity of the documentation provided. They do not evaluate the AI system itself.
${scores}

${heading("Executive Summary")}
${lastReview.executiveSummary || "This review reflects only the documentation analyzed. Additional governance documentation may provide important context."}

${sections}

${heading("Follow-up Questions")}
${questions}

${heading("Suggested Next Documents to Review")}
${documents}

AGE assesses documentation only. It does not determine whether an AI system is fair, unfair, compliant, noncompliant, safe, or trustworthy.`;
}

async function copyBrief() {
  const button = document.querySelector("#copy-review");
  const status = document.querySelector("#export-status");
  const text = formatBrief(false);
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {}
  if (!copied) {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.style.position = "fixed";
    helper.style.left = "-9999px";
    helper.style.top = "0";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.focus();
    helper.select();
    helper.setSelectionRange(0, helper.value.length);
    copied = document.execCommand("copy");
    helper.remove();
  }
  const original = button.textContent;
  button.textContent = copied ? "Copied" : "Copy unavailable";
  status.textContent = copied ? "Governance brief copied to the clipboard." : "Clipboard access was blocked. The full brief is selected below for manual copying.";
  if (!copied) {
    const fallback = document.querySelector("#copy-fallback");
    const fallbackText = document.querySelector("#copy-fallback-text");
    fallbackText.value = text;
    fallback.classList.remove("hidden");
    fallbackText.focus();
    fallbackText.select();
  }
  setTimeout(() => { button.textContent = original; }, 2400);
}

function downloadBrief(markdown) {
  const output = formatBrief(markdown);
  const blob = new Blob([output], { type: markdown ? "text/markdown" : "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `AGE-governance-evidence-brief.${markdown ? "md" : "txt"}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function switchView(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelector(`#${view}-view`).classList.add("active");
  document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.view === view));
  document.querySelector("#page-title").textContent = view === "workspace" ? "Review workspace" : view === "methodology" ? "Methodology" : "Review history";
  if (view === "history") renderHistory();
}

els.text.addEventListener("input", () => {
  const length = els.text.value.trim().length;
  els.count.textContent = `${length.toLocaleString()} characters`;
  els.analyze.disabled = length < 200;
  els.validation.textContent = length >= 200 ? "Document is ready for structured review." : `Enter ${200 - length} more characters to begin.`;
});
els.analyze.addEventListener("click", analyzeDocument);
document.querySelector("#load-sample").addEventListener("click", () => {
  els.text.value = SAMPLE;
  els.title.value = "Public Responsible AI Assessment Summary: Example";
  currentSource = "Worked example";
  showImportStats({ characters: SAMPLE.length, tables: 0, images: 0, primary: true });
  els.text.dispatchEvent(new Event("input"));
});
document.querySelectorAll(".source-tab").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll(".source-tab").forEach(item => item.classList.toggle("active", item === tab));
  document.querySelectorAll(".source-panel").forEach(panel => panel.classList.toggle("active", panel.id === `${tab.dataset.source}-source`));
  if (tab.dataset.source === "paste") currentSource = "Pasted text";
}));
document.querySelector("#import-url").addEventListener("click", importUrl);
els.url.addEventListener("keydown", event => { if (event.key === "Enter") importUrl(); });
els.file.addEventListener("change", () => importFile(els.file.files[0]));
document.querySelector("#new-review").addEventListener("click", () => { switchView("workspace"); resetReview(); });
document.querySelector("#edit-document").addEventListener("click", () => {
  els.inputState.classList.remove("hidden");
  els.resultsState.classList.add("hidden");
});
document.querySelector("#copy-review").addEventListener("click", copyBrief);
document.querySelector("#close-copy-fallback").addEventListener("click", () => document.querySelector("#copy-fallback").classList.add("hidden"));
document.querySelector("#download-text").addEventListener("click", () => downloadBrief(false));
document.querySelector("#download-markdown").addEventListener("click", () => downloadBrief(true));
document.querySelectorAll(".nav-item").forEach(item => item.addEventListener("click", () => switchView(item.dataset.view)));
document.querySelectorAll("[data-view-link]").forEach(item => item.addEventListener("click", () => switchView(item.dataset.viewLink)));
document.querySelector("#history-list").addEventListener("click", event => {
  const button = event.target.closest(".reopen-review");
  if (button) reopenReview(button.dataset.reviewId);
});

renderFramework();
renderHistory();
