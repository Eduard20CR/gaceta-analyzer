import { describe, expect, it } from 'vitest';

import { buildBlocks, pageMarker } from '../src/lib/blocks';
import type { PageText } from '../src/lib/pdf';

/** Makes `count` pages numbered from 1, each with a short text. */
function makePages(count: number): PageText[] {
  const pages: PageText[] = [];
  for (let pageNumber = 1; pageNumber <= count; pageNumber++) {
    pages.push({ pageNumber, text: `Texto de la página ${pageNumber}` });
  }
  return pages;
}

/** The page numbers of each block, which is what most tests compare. */
function pageNumbersOf(pages: PageText[], pagesPerBlock: number): number[][] {
  return buildBlocks(pages, pagesPerBlock).map((block) => block.pageNumbers);
}

describe('pageMarker', () => {
  it('writes the page number between dashes', () => {
    expect(pageMarker(14)).toBe('--- PAGE 14 ---');
  });
});

describe('buildBlocks', () => {
  it('builds 1–5, 5–9, 9–13 for 13 pages of size 5', () => {
    expect(pageNumbersOf(makePages(13), 5)).toEqual([
      [1, 2, 3, 4, 5],
      [5, 6, 7, 8, 9],
      [9, 10, 11, 12, 13],
    ]);
  });

  it('builds 1–5, 5–9 for 9 pages, without a block made only of page 9', () => {
    expect(pageNumbersOf(makePages(9), 5)).toEqual([
      [1, 2, 3, 4, 5],
      [5, 6, 7, 8, 9],
    ]);
  });

  it('makes a shorter last block when the pages do not divide evenly', () => {
    expect(pageNumbersOf(makePages(10), 5)).toEqual([
      [1, 2, 3, 4, 5],
      [5, 6, 7, 8, 9],
      [9, 10],
    ]);
  });

  it('builds one block 1–3 for 3 pages of size 5', () => {
    expect(pageNumbersOf(makePages(3), 5)).toEqual([[1, 2, 3]]);
  });

  it('builds one block for a single page', () => {
    expect(pageNumbersOf(makePages(1), 5)).toEqual([[1]]);
  });

  it('builds 1–2, 2–3, 3–4… with size 2', () => {
    expect(pageNumbersOf(makePages(5), 2)).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ]);
  });

  it('returns no blocks when there are no pages', () => {
    expect(buildBlocks([], 5)).toEqual([]);
  });

  it.each([1, 0, -5, 2.5])('throws for size %s', (pagesPerBlock) => {
    expect(() => buildBlocks(makePages(5), pagesPerBlock)).toThrow(
      /pagesPerBlock/,
    );
  });

  it('numbers the blocks from 0, in order', () => {
    const blocks = buildBlocks(makePages(13), 5);

    expect(blocks.map((block) => block.index)).toEqual([0, 1, 2]);
  });

  it.each([
    [1, 2],
    [2, 2],
    [7, 3],
    [500, 5],
    [501, 5],
    [37, 10],
    [100, 100],
  ])(
    'covers every page and shares one page between blocks (%s pages, size %s)',
    (pageCount, pagesPerBlock) => {
      const blocks = buildBlocks(makePages(pageCount), pagesPerBlock);

      const coveredPages = new Set(
        blocks.flatMap((block) => block.pageNumbers),
      );
      expect(coveredPages.size).toBe(pageCount);

      for (let i = 1; i < blocks.length; i++) {
        const previousLastPage = blocks[i - 1]?.pageNumbers.at(-1);
        const currentFirstPage = blocks[i]?.pageNumbers[0];
        expect(currentFirstPage).toBe(previousLastPage);
      }

      for (const block of blocks) {
        expect(block.pageNumbers.length).toBeLessThanOrEqual(pagesPerBlock);
      }
    },
  );

  it("puts each page's marker in the block text, in order, before its text", () => {
    const [firstBlock] = buildBlocks(makePages(3), 5);

    expect(firstBlock?.text).toBe(
      [
        '--- PAGE 1 ---\nTexto de la página 1',
        '--- PAGE 2 ---\nTexto de la página 2',
        '--- PAGE 3 ---\nTexto de la página 3',
      ].join('\n\n'),
    );
  });

  it('keeps empty pages so their markers and page numbers stay', () => {
    const pages: PageText[] = [
      { pageNumber: 1, text: 'Impuestos' },
      { pageNumber: 2, text: '' },
      { pageNumber: 3, text: 'Aranceles' },
    ];

    const [block] = buildBlocks(pages, 5);

    expect(block?.pageNumbers).toEqual([1, 2, 3]);
    const text = block?.text ?? '';
    const positionOfPage1 = text.indexOf(pageMarker(1));
    const positionOfPage2 = text.indexOf(pageMarker(2));
    const positionOfPage3 = text.indexOf(pageMarker(3));
    // Every marker is present (-1 means "not found") and they are in page order.
    expect(positionOfPage1).toBeGreaterThan(-1);
    expect(positionOfPage2).toBeGreaterThan(positionOfPage1);
    expect(positionOfPage3).toBeGreaterThan(positionOfPage2);
  });
});
