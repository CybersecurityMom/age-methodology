# Changelog

All notable changes to the AI Governance Evidence (AGE) Methodology are documented here.

## [1.0.0] — 2026-07-04

### Summary

Initial public release of the AGE Methodology application, created by AQ'S Corner LLC for structured review of publicly available AI governance evidence.

### New features

- Seven evidence domains: Purpose, Scope, Evidence, Transparency, Governance, Limitations, and Follow-up.
- Text paste, public URL import, and HTML/TXT/Markdown/CSV file upload.
- Governance evidence brief with documentation completeness scores.
- Evidence boundary language that distinguishes absent disclosure from proof of absence.
- Copy, plain-text export, and Markdown export.
- Local, reopenable review history.
- Methodology and About AGE pages.

### Improvements

- Primary-content extraction minimizes navigation, cookie notices, login prompts, and page chrome.
- Import statistics explain the approximate content, tables, and images analyzed.
- Concise governance observations replace long source excerpts.
- Follow-up questions focus on locating additional evidence.
- Suggested next documents are tailored to the reviewed document type.
- Responsive spacing, typography, and card alignment refined for portfolio presentation.
- Removed the duplicate current-stage indicator while retaining the clearer three-step workflow.
- URL reviews now use the document’s extracted page title when available.
- Governance observations identify the specific disclosure signals found in the provided text.

### Bug fixes

- Added controlled URL retrieval for websites that block direct browser access.
- Added rendered-page fallback for JavaScript-delivered content.
- Added generic URL normalization and a public text-reader fallback for access-verification pages.
- Added explicit handling for image-based evidence that cannot be read as document text.
- Improved clipboard fallback and file downloads.
- Added production host/port support, a health endpoint, dependency manifest, and Render deployment Blueprint.

### Planned future enhancements

- Additional configurable governance modules.
- Optional organization-level review taxonomies.
- Expanded document format support.
- Reviewer annotations and comparative review workflows.

<!--
## [1.1.0] — YYYY-MM-DD

### Summary
### New features
### Improvements
### Bug fixes
### Planned future enhancements
-->
