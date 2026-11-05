# Spike 0001 — PDF text extraction: unpdf vs PyMuPDF

- **Issue:** #10
- **Date:** 2026-11-05
- **Verdict:** unpdf is good enough. ADR-0009 is accepted; mupdf is not needed.

## Question

ADR-0009 chose unpdf (pdf.js) and flagged a risk: pdf.js might order text worse than PyMuPDF (used by the Python proof of concept) on multi-column pages. Is unpdf's text good enough for the analysis (FR-03) and for quote verification (#13)?

## Method

- **PDF:** La Gaceta Nº 210, Thursday 5 November 2026 (Imprenta Nacional), 116 pages, about 10 MB. Two-column layout, plus tables, a table of contents and digital signature boxes. The PDF and the extracted text are **not** committed.
- **unpdf:** `extractPages` from `apps/api/src/lib/pdf.ts` (unpdf 2.1.0), through `scripts/spikes/extract-with-unpdf.mjs`.
- **PyMuPDF:** PyMuPDF 1.28.6 through `scripts/spikes/extract_with_pymupdf.py`, in two modes:
  - `get_text()`: the order of the PDF's content stream (the default).
  - `get_text(sort=True)`: text blocks sorted top-to-bottom, then left-to-right.
- **Comparison:** for every one of the 116 pages, word counts, word-sequence similarity (Python `difflib`) and a word-level diff, then a manual reading of the pages below.

## Results

### Overall

| | unpdf | PyMuPDF `get_text()` | PyMuPDF `sort=True` |
|---|---|---|---|
| Words (116 pages) | 120,199 | 120,404 | 119,699 |
| Median word-order similarity with unpdf | — | 0.999 | 0.506 |
| Time for 116 pages | ~1.1 s | ~0.3 s | ~3.1 s |

unpdf and PyMuPDF's default mode produce almost the same text in the same order. Every difference across the 116 pages falls into one of the categories below.

### Pages compared

| Page | Content | What happened |
|---|---|---|
| 99 (and other two-column pages) | Two columns of notices | Both tools follow the content stream: one whole column, then the other. Columns are never mixed. `sort=True` in PyMuPDF **interleaves the two columns line by line**, which breaks every sentence: it is clearly the worst option. |
| 19 | Trademark notices with many words split across lines | Same words. PyMuPDF keeps the soft hyphen (U+00AD) at the end of the line; unpdf turns it into a normal `-` (`produc-` / `tos`). See "Impact on #13". |
| 90 | Table of 39 rows × 3 columns (member number, name) | unpdf keeps each row on one line (`32. 7947 ALFARO ARNAEZ ROY`). PyMuPDF writes each cell on its own line. unpdf is slightly better here. |
| 116 | Table of 18 × 8, end of the issue, signature boxes | Table text is the same in both. PyMuPDF also extracts the digital signature boxes (name, ID, date), which are form annotations; unpdf does not. That text is not content, so missing it is fine. |
| 16 | Trademark notice | One line comes out with no spaces in unpdf (`Paraprotegerydistinguir:Unestablecimiento`), correct in PyMuPDF. It is the only such line in the 116 pages. |
| 2 | Table of contents with dot leaders | Same words; unpdf puts a space before the page number (`Decretos ..... 2`), PyMuPDF does not. Harmless. |
| 47 | Chemical name written with letter spacing | Both tools return spaced letters (`P I P E R I D I N`), with one small difference (`V A` vs `VA`). Harmless. |
| 112, 114 | Pages whose content is images | Only the page header is extracted by either tool. Text inside images needs OCR, which is out of scope (FR-03 only handles PDFs with a text layer). |
| Every page | Running header | unpdf joins the header with the page number (`…del 2026Pág 99`); PyMuPDF puts them on two lines. Harmless. |

Accents, `ñ`, `º`, typographic quotes and dashes (`—`) came out identically in both tools: the word diff found no differences in them.

## Impact on #13 (quote verification)

unpdf writes a word broken across lines (soft hyphen) and a real hyphen at the end of a line in the same way. In this issue there are 464 lines ending with `-`: 335 are words broken across lines (`produc-` / `tos`) and 129 are real hyphens (`29643-` / `H`, `1-1445-` / `0510`).

So `normalizeForComparison` cannot simply remove `-` plus line break: it would join `29643-H` into `29643H` and the AI's quote would not match. Recommendation for #13: when comparing, remove a hyphen together with any whitespace after it **in both the quote and the page text** (`/-\s*/g` → `""`). Then `produc-\ntos` and `productos` both become `productos`, and `29643-\nH` and `29643-H` both become `29643h`.

## Verdict

unpdf is as good as PyMuPDF on this document. On multi-column pages it keeps each column whole and in order. The only real defect found was one line without spaces in 116 pages. Its table output is slightly better. Switching to mupdf (AGPL) would not improve anything that matters for the analysis, so:

- ADR-0009 moves to `Accepted`.
- No follow-up issue to change `lib/pdf.ts` is needed.
- #13 should use the hyphen rule above.

## How to repeat it

```bash
node scripts/spikes/extract-with-unpdf.mjs <pdf> <out-dir>/unpdf
pip install pymupdf
python scripts/spikes/extract_with_pymupdf.py <pdf> <out-dir>/pymupdf
```

Keep `<pdf>` and `<out-dir>` outside the repository.
