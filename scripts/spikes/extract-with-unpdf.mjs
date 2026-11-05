// Spike #10: writes the text that lib/pdf.ts (unpdf) extracts from a PDF, one
// file per page, so it can be compared with PyMuPDF's output
// (extract_with_pymupdf.py). See docs/spikes/0001-pdf-extraction.md.
//
// Usage, from the repository root (Node.js 24 runs the imported .ts file
// directly by stripping its types):
//   node scripts/spikes/extract-with-unpdf.mjs <pdf> <out-dir>
//
// Never commit the PDF or the output: keep both outside the repository.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { extractPages } from '../../apps/api/src/lib/pdf.ts';

const [pdfPath, outDir] = process.argv.slice(2);
if (pdfPath === undefined || outDir === undefined) {
  console.error('Usage: extract-with-unpdf.mjs <pdf> <out-dir>');
  process.exit(1);
}

const startedAt = Date.now();
const pages = await extractPages(new Uint8Array(await readFile(pdfPath)));
const durationMs = Date.now() - startedAt;

await mkdir(outDir, { recursive: true });
for (const page of pages) {
  const fileName = `page-${String(page.pageNumber).padStart(3, '0')}.txt`;
  await writeFile(join(outDir, fileName), page.text);
}

console.log(`unpdf: ${pages.length} pages in ${durationMs} ms`);
