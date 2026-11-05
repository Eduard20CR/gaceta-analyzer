// All PDF reading goes through this module (ADR-0009), so switching from unpdf
// to another library (for example, mupdf) only changes this file.
//
// NEVER log the page text (NFR-OBS-03). Log page numbers and counts instead.

import { extractText, getDocumentProxy } from 'unpdf';

/** The text of one PDF page. */
export interface PageText {
  /** 1-based, like the page numbers a person sees in a PDF viewer. */
  pageNumber: number;
  text: string;
}

/** Shown to the user when the PDF has no text layer (FR-03). In Spanish on purpose. */
export const PDF_WITHOUT_TEXT_MESSAGE =
  'El PDF no contiene texto. Puede ser un documento escaneado';

/**
 * Thrown by `analyze-pdf` when `hasAnyText` returns false.
 * `message` is the Spanish text to store as the job's `errorMessage`.
 */
export class PdfWithoutTextError extends Error {
  constructor() {
    super(PDF_WITHOUT_TEXT_MESSAGE);
    this.name = 'PdfWithoutTextError';
  }
}

/** Thrown when the file is not a PDF, is corrupt or cannot be opened. */
export class UnreadablePdfError extends Error {
  constructor(cause: unknown) {
    super('The PDF could not be read. It may be corrupt or not a PDF file.', {
      cause,
    });
    this.name = 'UnreadablePdfError';
  }
}

/**
 * Extracts the text of every page, in order, with no page limit.
 *
 * Note: pdf.js may take ownership of `pdfBytes` (its buffer can be emptied
 * after the call), so do not reuse the array afterwards.
 */
export async function extractPages(pdfBytes: Uint8Array): Promise<PageText[]> {
  const pageTexts = await readTextOfEveryPage(pdfBytes);

  return pageTexts.map((text, index) => ({
    pageNumber: index + 1,
    text,
  }));
}

/** False when every page is empty or only whitespace, which usually means a scanned PDF. */
export function hasAnyText(pages: PageText[]): boolean {
  return pages.some((page) => page.text.trim().length > 0);
}

async function readTextOfEveryPage(pdfBytes: Uint8Array): Promise<string[]> {
  try {
    const document = await getDocumentProxy(pdfBytes);
    try {
      // mergePages: false returns one string per page, in page order.
      const { text } = await extractText(document, { mergePages: false });
      return text;
    } finally {
      // Frees the memory pdf.js holds for the document (PDFs can be up to 100 MB).
      await document.loadingTask.destroy();
    }
  } catch (error) {
    throw new UnreadablePdfError(error);
  }
}
