// Groups the pages of a PDF into blocks, one block per AI call (FR-03, ADR-0012).
//
// Consecutive blocks share OVERLAP_PAGES page(s), so a topic that starts at the
// end of one block and continues on the next page is still seen in one piece.
// With 5 pages per block: 1–5, 5–9, 9–13…

import { MIN_PAGES_PER_BLOCK, OVERLAP_PAGES } from '@gaceta/shared';

import type { PageText } from './pdf';

/** The pages sent to the AI in one call. */
export interface Block {
  /** 0-based position of the block, in page order. */
  index: number;
  /** 1-based page numbers of the pages in this block, in order. */
  pageNumbers: number[];
  /** Text of every page, each one preceded by its page marker. */
  text: string;
}

/**
 * The line written before each page's text, for example `--- PAGE 14 ---`.
 *
 * The AI system prompt (lib/ai-client.ts) explains this format so the AI can
 * tell which page each quote comes from. Change both together.
 */
export function pageMarker(pageNumber: number): string {
  return `--- PAGE ${pageNumber} ---`;
}

/**
 * Splits `pages` into blocks of `pagesPerBlock` pages with a fixed overlap.
 *
 * - Every page appears in at least one block.
 * - The last block may be shorter, but it never holds only the page that the
 *   previous block already covered (9 pages, size 5 → 1–5, 5–9; no extra "9").
 * - Empty pages are kept, so their marker is still in the text and the page
 *   numbers stay correct.
 * - No pages → no blocks.
 */
export function buildBlocks(pages: PageText[], pagesPerBlock: number): Block[] {
  assertValidBlockSize(pagesPerBlock);

  // How far the start moves from one block to the next. Because pagesPerBlock is
  // at least 2 and the overlap is 1, the step is at least 1: the loop always ends.
  const step = pagesPerBlock - OVERLAP_PAGES;
  const blocks: Block[] = [];

  let start = 0;
  while (start < pages.length) {
    const end = Math.min(start + pagesPerBlock, pages.length);
    const blockPages = pages.slice(start, end);
    blocks.push(createBlock(blocks.length, blockPages));

    // This block reached the last page, so a next block would only repeat
    // the overlap page.
    if (end === pages.length) {
      break;
    }
    start += step;
  }

  return blocks;
}

function assertValidBlockSize(pagesPerBlock: number): void {
  const isWholeNumber = Number.isInteger(pagesPerBlock);
  if (!isWholeNumber || pagesPerBlock < MIN_PAGES_PER_BLOCK) {
    throw new Error(
      `pagesPerBlock must be a whole number of at least ${MIN_PAGES_PER_BLOCK}, got ${pagesPerBlock}`,
    );
  }
}

function createBlock(index: number, pages: PageText[]): Block {
  return {
    index,
    pageNumbers: pages.map((page) => page.pageNumber),
    text: joinPagesWithMarkers(pages),
  };
}

function joinPagesWithMarkers(pages: PageText[]): string {
  const pageSections = pages.map(
    (page) => `${pageMarker(page.pageNumber)}\n${page.text}`,
  );
  return pageSections.join('\n\n');
}
