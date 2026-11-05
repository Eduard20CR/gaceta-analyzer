# ADR-0009 — Text extraction with unpdf

- **Status:** Accepted
- **Date:** 2026-11-04 (accepted 2026-11-05 after [spike 0001](../spikes/0001-pdf-extraction.md))

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
- **Risk checked:** pdf.js might order text worse on multi-column pages. [Spike 0001](../spikes/0001-pdf-extraction.md) compared it with PyMuPDF on a real 116-page La Gaceta PDF: the text and its order are almost the same, and each column is kept whole. mupdf is not needed. If a future PDF shows otherwise, switch with a new ADR; all PDF access goes through `lib/pdf.ts`, so the change touches a single file.
- unpdf writes a word broken across lines (soft hyphen) and a real hyphen at the end of a line the same way (`-`). Quote verification (#13) must handle both (see the spike).
