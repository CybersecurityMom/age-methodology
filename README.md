# AI Governance Evidence (AGE) Methodology

AGE is a browser-based workspace for reviewing publicly available AI governance documentation using a consistent, evidence-first framework. It evaluates documentation completeness without assuming that an undisclosed practice or control does not exist.

Created by **AQ’S Corner LLC** as part of the AI Governance Evidence (AGE) Methodology project.

## Run the application

No build step is required. Start the included AGE server so public URLs can be read through the controlled webpage readers.

```bash
python3 server.py
```

Open `http://localhost:4173`.

## Public deployment

AGE includes a `render.yaml` Blueprint for deployment as a Render web service. Push this project to its own GitHub repository, create a new Render Blueprint from that repository, and Render will build the Python dependencies, start the AGE server, check `/health`, and provide a public `onrender.com` URL.

The server reads Render's `PORT` environment variable and binds to `0.0.0.0` in the hosted environment. Local development continues to use `127.0.0.1:4173`.

## Methodology

AGE reviews supplied text through seven evidence domains:

1. **Purpose** — intent, intended use, decision context, and audience.
2. **Scope** — systems, lifecycle stages, jurisdictions, and exclusions.
3. **Evidence** — methods, tests, metrics, results, references, and independent support.
4. **Transparency** — disclosed data, design choices, risks, changes, and supporting artifacts.
5. **Governance** — oversight, accountability, monitoring, risk management, bias mitigation, and documentation controls.
6. **Limitations** — assumptions, uncertainty, constraints, prohibited uses, and performance boundaries.
7. **Follow-up** — focused governance questions and recommended next artifacts.

The application uses keyword and phrase signals to assess documentation completeness. Results describe only the text supplied by the reviewer. They are not a compliance determination, an audit opinion, or an assessment of whether a system or control performs effectively.

AGE evaluates only the text provided. An absent disclosure should be treated as “not found in the provided text,” not as proof that the evidence does not exist.

### Interpretation

- **Clearly stated**: multiple relevant documentation signals are present.
- **Some detail found**: the subject is addressed, but additional documentation may be needed.
- **Not found in text**: the supplied text does not contain clear evidence for the domain. This is not proof that the practice or evidence does not exist.

The completeness panel scores Scope Clarity, Evidence Quality, Transparency, Governance Detail, and Limitations Disclosure. The overall score is an average of these documentation measures. It does not rate trustworthiness, fairness, compliance, or safety.

## Architecture

The application is intentionally dependency-free:

- `index.html` defines the accessible application shell, review flow, results, and methodology reference.
- `styles.css` contains the responsive enterprise design system and AQ’S Corner brand palette.
- `app.js` contains methodology configuration, local text analysis, documentation scoring, recommendations, navigation, copy support, and text/Markdown export.

Review modules are configuration objects in the `MODULES` array. A new module can be added by defining its identifier, title, disclosure signals, reviewer questions, and gap language. Rendering and scoring are data-driven, so no additional view code is required.

## Source import

Reviewers can paste text, read a public webpage URL, or upload an HTML, TXT, Markdown, or CSV file. Tables present in HTML source are converted into labeled rows so headers and cell relationships remain available to the evidence analysis. Tables loaded later by webpage scripts may need to be exported as CSV or saved HTML and uploaded separately.

Public URL reading uses a layered pipeline:

1. Direct browser retrieval.
2. Controlled server-side retrieval when a publisher blocks browser access.
3. Rendered-page retrieval for JavaScript-loaded text and tables.
4. Public text-reader retrieval when an access-verification page blocks both standard readers.
5. Identification of images labeled as tables, charts, figures, audit results, assessments, or metrics, with an explicit file-upload path for row-level analysis.
6. File upload for login-protected, paywalled, or otherwise unavailable content.

URL input accepts full HTTP/HTTPS URLs, protocol-relative URLs, www addresses, domain paths, and a URL copied as a Markdown link. AGE normalizes these formats to a public HTTPS address when no protocol is supplied.

The readers accept only public HTTP/HTTPS addresses, block local and private destination URLs, limit response sizes, apply timeouts, and restrict standard retrieval to document-oriented content types. Rendered extraction uses an available local Chrome or Edge installation and rejects access-verification pages as document content. When a site blocks both readers, AGE may send only the public URL to the Jina AI Reader service to retrieve a text representation. AGE records image labels and asks for an image or CSV upload instead of implying that image-only rows were analyzed.

## Privacy

Pasted and uploaded document text is processed in the browser and is not persisted by the application. When URL import is used, the public URL is retrieved by the local AGE server and may be sent to the public text-reader fallback if the publisher blocks standard access. Review history is stored only in the browser's local storage.

## Brand palette

- AQ blue: `#3DB2F3`
- AQ magenta: `#DF58CC`
- Ink black: `#111318`
- Canvas: `#F5F7F9`
