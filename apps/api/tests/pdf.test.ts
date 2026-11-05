import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  extractPages,
  hasAnyText,
  PDF_WITHOUT_TEXT_MESSAGE,
  PdfWithoutTextError,
  UnreadablePdfError,
} from '../src/lib/pdf';

// Small PDFs made by tests/fixtures/generate-fixtures.py.
async function readFixture(fileName: string): Promise<Uint8Array> {
  const buffer = await readFile(
    new URL(`./fixtures/${fileName}`, import.meta.url),
  );
  return new Uint8Array(buffer);
}

describe('extractPages', () => {
  it('returns one entry per page, in order, with 1-based page numbers', async () => {
    const pages = await extractPages(
      await readFixture('three-pages-with-text.pdf'),
    );

    expect(pages.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
    expect(pages[0]?.text).toContain('Página uno: impuestos sobre la renta.');
    expect(pages[1]?.text).toContain('aranceles de importación');
    expect(pages[2]?.text).toContain('fin del documento');
  });

  it('returns empty text for pages without a text layer', async () => {
    const pages = await extractPages(
      await readFixture('two-pages-without-text.pdf'),
    );

    expect(pages).toHaveLength(2);
    expect(pages.every((page) => page.text.trim() === '')).toBe(true);
  });

  it('throws a descriptive error when the file is not a PDF', async () => {
    const notAPdf = new TextEncoder().encode('this is not a PDF');

    await expect(extractPages(notAPdf)).rejects.toThrow(UnreadablePdfError);
    await expect(
      extractPages(new TextEncoder().encode('still not a PDF')),
    ).rejects.toThrow(/could not be read/);
  });

  it('throws when a PDF is cut in half', async () => {
    const pdf = await readFixture('three-pages-with-text.pdf');
    const truncated = pdf.slice(0, 200);

    await expect(extractPages(truncated)).rejects.toThrow(UnreadablePdfError);
  });
});

describe('hasAnyText', () => {
  it('is true when at least one page has text', () => {
    const pages = [
      { pageNumber: 1, text: '' },
      { pageNumber: 2, text: 'Impuestos' },
    ];

    expect(hasAnyText(pages)).toBe(true);
  });

  it('is false when every page is empty or only whitespace', () => {
    const pages = [
      { pageNumber: 1, text: '' },
      { pageNumber: 2, text: '  \n\t ' },
    ];

    expect(hasAnyText(pages)).toBe(false);
  });

  it('is false for a PDF without a text layer', async () => {
    const pages = await extractPages(
      await readFixture('two-pages-without-text.pdf'),
    );

    expect(hasAnyText(pages)).toBe(false);
  });
});

describe('PdfWithoutTextError', () => {
  it('carries the Spanish message shown to the user', () => {
    const error = new PdfWithoutTextError();

    expect(error.message).toBe(PDF_WITHOUT_TEXT_MESSAGE);
    expect(error.message).toBe(
      'El PDF no contiene texto. Puede ser un documento escaneado',
    );
  });
});
