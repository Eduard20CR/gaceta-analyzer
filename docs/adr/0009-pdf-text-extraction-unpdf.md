# ADR-0009 — Text extraction with unpdf

- **Status:** Proposed
- **Date:** 2026-11-04

## Context

The Python proof of concept used PyMuPDF. In Node.js a different library is needed. It must extract text per page, run on Lambda without compiling native code and, in the future, make it possible to locate a quote's position for highlighting.

## Decision

Use **unpdf**, a wrapper around pdf.js (Mozilla's PDF engine) designed for serverless environments.

## Alternatives considered

- **pdf-parse:** very simple, but less maintained and does not split by page well.
- **pdfjs-dist directly:** this is what unpdf uses internally; unpdf saves the Node setup.
- **mupdf (npm, WebAssembly):** the equivalent of PyMuPDF, with better extraction on multi-column documents and text search with coordinates. AGPL license. Kept as plan B.

## Consequences

- Pure JavaScript: simple bundling with esbuild, no architecture issues.
- The frontend viewer (react-pdf) also uses pdf.js, so coordinates computed in the backend will match the viewer's when highlighting is implemented.
- Large PDFs (up to 100 MB) are loaded fully into memory. The analysis Lambda has 3008 MB for this reason (NFR-REL-05).
- **Risk:** pdf.js may order text worse on multi-column pages. In phase 2 its extraction is compared with PyMuPDF on a real La Gaceta PDF. If quality is noticeably worse, switch to mupdf with a new ADR. All PDF access goes through `lib/pdf.ts`, so the change touches a single file.
