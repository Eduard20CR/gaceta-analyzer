// The whole analysis of one PDF (FR-03), shared by the local CLI (#15) and the
// analyze-pdf handler (#22):
//   extract pages → build blocks → analyze blocks in parallel → verify,
//   deduplicate and sort the findings.
//
// This module knows nothing about S3 or DynamoDB: the caller reads the PDF,
// passes an AI client, and stores the result.
//
// NEVER log the PDF text, the query or the quotes (NFR-OBS-03).

import type { Finding } from '@gaceta/shared';

import type { AiClient } from './ai-client';
import { buildBlocks } from './blocks';
import type { Block } from './blocks';
import {
  deduplicateFindings,
  indexPagesByNumber,
  sortFindings,
  summarizeFindings,
  verifyFinding,
} from './findings';
import type { PagesByNumber } from './findings';
import { createLogger } from './logger';
import type { Logger } from './logger';
import { PdfWithoutTextError, extractPages, hasAnyText } from './pdf';
import type { PageText } from './pdf';

/** At most this many AI calls at the same time, unless the caller says otherwise (NFR-PERF-02). */
export const DEFAULT_MAX_CONCURRENCY = 5;

/** Shown to the user when no block could be analyzed (FR-03). In Spanish on purpose. */
export const ALL_BLOCKS_FAILED_MESSAGE =
  'No se pudo analizar ninguna parte del documento. Intente de nuevo más tarde';

/**
 * Thrown when every block failed after its retries.
 * `message` is the Spanish text to store as the job's `errorMessage`.
 */
export class AllBlocksFailedError extends Error {
  constructor() {
    super(ALL_BLOCKS_FAILED_MESSAGE);
    this.name = 'AllBlocksFailedError';
  }
}

export interface AnalysisProgress {
  processedBlocks: number;
  totalBlocks: number;
  /** Pages of the PDF; the same in every call. analyze-pdf stores it with the totals. */
  pageCount: number;
}

export interface AnalysisOptions {
  query: string;
  pagesPerBlock: number;
  /** Defaults to DEFAULT_MAX_CONCURRENCY. */
  maxConcurrency?: number;
  aiClient: AiClient;
  /**
   * Called once before the first block with `processedBlocks: 0`, then after
   * every block, whether it worked or failed.
   */
  onProgress?: (progress: AnalysisProgress) => void | Promise<void>;
  /** Pass `createLogger({ jobId })` so warnings include the job id. */
  logger?: Logger;
}

export interface AnalysisResult {
  /** Verified, without duplicates, sorted by page. */
  findings: Finding[];
  pageCount: number;
  totalBlocks: number;
  failedBlocks: number;
  /** Pages that no successful block covered; sorted, without repeats. */
  failedPages: number[];
  findingsCount: number;
  relevantPages: number[];
  /** Tokens of the successful blocks. */
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

/**
 * Analyzes a whole PDF. Throws `PdfWithoutTextError` (before any AI call) when
 * the PDF has no text, and `AllBlocksFailedError` when no block could be analyzed.
 *
 * Note: pdf.js may empty `pdfBytes` after reading it, so do not reuse the array.
 */
export async function runAnalysis(
  pdfBytes: Uint8Array,
  options: AnalysisOptions,
): Promise<AnalysisResult> {
  const startedAt = Date.now();
  const pages = await extractPages(pdfBytes);
  const result = await analyzePages(pages, options);
  // The duration includes reading the PDF, not only the AI calls.
  return { ...result, durationMs: Date.now() - startedAt };
}

/**
 * Same as `runAnalysis`, for pages that were already extracted. Exported so
 * tests can use many synthetic pages without building a large PDF.
 */
export async function analyzePages(
  pages: PageText[],
  options: AnalysisOptions,
): Promise<AnalysisResult> {
  const startedAt = Date.now();
  const logger = options.logger ?? createLogger();

  if (!hasAnyText(pages)) {
    throw new PdfWithoutTextError();
  }

  const blocks = buildBlocks(pages, options.pagesPerBlock);
  const pagesByNumber = indexPagesByNumber(pages);
  const progress: AnalysisProgress = {
    processedBlocks: 0,
    totalBlocks: blocks.length,
    pageCount: pages.length,
  };
  await options.onProgress?.({ ...progress });

  const outcomes = await runWithConcurrencyLimit(
    blocks,
    options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
    async (block) => {
      const outcome = await analyzeOneBlock(
        block,
        options,
        pagesByNumber,
        logger,
      );
      progress.processedBlocks += 1;
      await options.onProgress?.({ ...progress });
      return outcome;
    },
  );

  return combineOutcomes(pages.length, blocks, outcomes, startedAt);
}

type BlockOutcome =
  | {
      succeeded: true;
      findings: Finding[];
      inputTokens: number;
      outputTokens: number;
    }
  | { succeeded: false };

/** Analyzes one block. A failure is returned, not thrown, so the other blocks go on (FR-03). */
async function analyzeOneBlock(
  block: Block,
  options: AnalysisOptions,
  pagesByNumber: PagesByNumber,
  logger: Logger,
): Promise<BlockOutcome> {
  try {
    const answer = await options.aiClient.analyzeBlock({
      blockText: block.text,
      query: options.query,
    });
    const findings = answer.findings.map((raw) =>
      verifyFinding(raw, block, pagesByNumber),
    );
    return {
      succeeded: true,
      findings,
      inputTokens: answer.usage.inputTokens,
      outputTokens: answer.usage.outputTokens,
    };
  } catch (error) {
    // The AI client already logged why each attempt failed.
    logger.warn('Block failed, its pages are skipped', {
      block: block.index,
      pageNumbers: block.pageNumbers,
      errorName: error instanceof Error ? error.name : 'unknown_error',
    });
    return { succeeded: false };
  }
}

function combineOutcomes(
  pageCount: number,
  blocks: Block[],
  outcomes: BlockOutcome[],
  startedAt: number,
): AnalysisResult {
  const allFindings: Finding[] = [];
  const analyzedPages = new Set<number>();
  const pagesOfFailedBlocks = new Set<number>();
  let failedBlocks = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  outcomes.forEach((outcome, index) => {
    const pageNumbers = blocks[index]?.pageNumbers ?? [];
    if (outcome.succeeded) {
      allFindings.push(...outcome.findings);
      inputTokens += outcome.inputTokens;
      outputTokens += outcome.outputTokens;
      pageNumbers.forEach((pageNumber) => analyzedPages.add(pageNumber));
    } else {
      failedBlocks += 1;
      pageNumbers.forEach((pageNumber) => pagesOfFailedBlocks.add(pageNumber));
    }
  });

  if (blocks.length > 0 && failedBlocks === blocks.length) {
    throw new AllBlocksFailedError();
  }

  // An overlap page of a failed block may still have been read by the next
  // block, so it is not reported as missing.
  const failedPages = [...pagesOfFailedBlocks]
    .filter((pageNumber) => !analyzedPages.has(pageNumber))
    .sort((a, b) => a - b);

  const findings = sortFindings(deduplicateFindings(allFindings));
  const summary = summarizeFindings(findings);

  return {
    findings,
    pageCount,
    totalBlocks: blocks.length,
    failedBlocks,
    failedPages,
    findingsCount: summary.findingsCount,
    relevantPages: summary.relevantPages,
    inputTokens,
    outputTokens,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Runs `worker` on every item, with at most `limit` running at the same time,
 * and returns the results in the same order as `items`.
 *
 * Written here instead of adding `p-limit`: it is a dozen lines, has no
 * dependency to keep up to date, and is easy to read. It starts `limit`
 * "lanes"; each lane takes the next item that nobody has taken yet, until none
 * are left. JavaScript runs one piece of code at a time, so two lanes can never
 * take the same index.
 */
export async function runWithConcurrencyLimit<Item, Result>(
  items: Item[],
  limit: number,
  worker: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`limit must be a whole number of at least 1, got ${limit}`);
  }

  const results: Result[] = new Array<Result>(items.length);
  let nextIndex = 0;

  async function runLane(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      // `index` is always below items.length here, so the item exists. The cast
      // only tells TypeScript that (noUncheckedIndexedAccess adds `undefined`).
      results[index] = await worker(items[index] as Item);
    }
  }

  const laneCount = Math.min(limit, items.length);
  const lanes: Promise<void>[] = [];
  for (let lane = 0; lane < laneCount; lane++) {
    lanes.push(runLane());
  }
  await Promise.all(lanes);

  return results;
}
