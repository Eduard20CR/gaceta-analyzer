import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import {
  ALL_BLOCKS_FAILED_MESSAGE,
  AllBlocksFailedError,
  analyzePages,
  runAnalysis,
  runWithConcurrencyLimit,
} from '../src/lib/analysis';
import type { AnalysisProgress } from '../src/lib/analysis';
import type { AiClient, AnalyzeBlockResult } from '../src/lib/ai-client';
import { pageMarker } from '../src/lib/blocks';
import type { Logger } from '../src/lib/logger';
import { PDF_WITHOUT_TEXT_MESSAGE, PdfWithoutTextError } from '../src/lib/pdf';
import type { PageText } from '../src/lib/pdf';

// No test calls DeepSeek: every analysis gets a fake AI client.

const silentLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

/** `count` pages numbered from 1; page N says "Texto de la página N". */
function makePages(count: number): PageText[] {
  const pages: PageText[] = [];
  for (let pageNumber = 1; pageNumber <= count; pageNumber++) {
    pages.push({ pageNumber, text: `Texto de la página ${pageNumber}` });
  }
  return pages;
}

/** The page numbers of a block, read back from its page markers. */
function pageNumbersInBlock(blockText: string): number[] {
  const matches = blockText.matchAll(/--- PAGE (\d+) ---/g);
  return [...matches].map((match) => Number(match[1]));
}

function emptyAnswer(): AnalyzeBlockResult {
  return { findings: [], usage: { inputTokens: 0, outputTokens: 0 } };
}

/**
 * A fake AI client that reports one finding on the first page of every block.
 * `analyzeBlock` is returned too, so tests can check how it was called.
 */
function createFindingPerBlockClient() {
  const analyzeBlock = vi.fn<AiClient['analyzeBlock']>(({ blockText }) => {
    const [firstPage = 1] = pageNumbersInBlock(blockText);
    return Promise.resolve({
      findings: [
        {
          page: firstPage,
          topic: 'impuestos',
          quote: `Texto de la página ${firstPage}`,
          reason: 'Ejemplo.',
          relevance: 'high',
        },
      ],
      usage: { inputTokens: 100, outputTokens: 10 },
    });
  });
  const aiClient: AiClient = { analyzeBlock };
  return { aiClient, analyzeBlock };
}

const baseOptions = {
  query: 'impuestos',
  pagesPerBlock: 5,
  logger: silentLogger,
};

describe('analyzePages', () => {
  it('never runs more than maxConcurrency AI calls at the same time', async () => {
    let running = 0;
    let mostRunning = 0;
    const aiClient: AiClient = {
      analyzeBlock: async () => {
        running += 1;
        mostRunning = Math.max(mostRunning, running);
        // Let the other lanes start before this call finishes.
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
        return emptyAnswer();
      },
    };

    // 101 pages with size 5 → 25 blocks.
    const result = await analyzePages(makePages(101), {
      ...baseOptions,
      maxConcurrency: 3,
      aiClient,
    });

    expect(result.totalBlocks).toBe(25);
    expect(mostRunning).toBe(3);
  });

  it('uses 5 concurrent calls by default', async () => {
    let running = 0;
    let mostRunning = 0;
    const aiClient: AiClient = {
      analyzeBlock: async () => {
        running += 1;
        mostRunning = Math.max(mostRunning, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
        return emptyAnswer();
      },
    };

    await analyzePages(makePages(101), { ...baseOptions, aiClient });

    expect(mostRunning).toBe(5);
  });

  it('skips a failed block, lists its pages and returns the other findings', async () => {
    // 13 pages, size 5 → blocks 1–5, 5–9, 9–13. The middle block fails.
    const findingClient = createFindingPerBlockClient();
    const aiClient: AiClient = {
      analyzeBlock: (input) => {
        if (pageNumbersInBlock(input.blockText)[0] === 5) {
          return Promise.reject(new Error('AI failed'));
        }
        return findingClient.analyzeBlock(input);
      },
    };

    const result = await analyzePages(makePages(13), {
      ...baseOptions,
      aiClient,
    });

    expect(result.failedBlocks).toBe(1);
    // Pages 5 and 9 were also read by the blocks that worked.
    expect(result.failedPages).toEqual([6, 7, 8]);
    expect(result.findings.map((finding) => finding.page)).toEqual([1, 9]);
    expect(result.findingsCount).toBe(2);
    expect(result.relevantPages).toEqual([1, 9]);
  });

  it('throws a Spanish message when every block fails', async () => {
    const aiClient: AiClient = {
      analyzeBlock: () => Promise.reject(new Error('AI failed')),
    };

    const analysis = analyzePages(makePages(13), { ...baseOptions, aiClient });

    await expect(analysis).rejects.toBeInstanceOf(AllBlocksFailedError);
    await expect(analysis).rejects.toThrow(ALL_BLOCKS_FAILED_MESSAGE);
  });

  it('throws the no-text message without calling the AI when no page has text', async () => {
    const { aiClient, analyzeBlock } = createFindingPerBlockClient();
    const pages: PageText[] = [
      { pageNumber: 1, text: '' },
      { pageNumber: 2, text: '   \n' },
    ];

    const analysis = analyzePages(pages, { ...baseOptions, aiClient });

    await expect(analysis).rejects.toBeInstanceOf(PdfWithoutTextError);
    await expect(analysis).rejects.toThrow(
      'El PDF no contiene texto. Puede ser un documento escaneado',
    );
    expect(analyzeBlock).not.toHaveBeenCalled();
  });

  it('reports progress from 0 up to the total number of blocks', async () => {
    const progressUpdates: AnalysisProgress[] = [];

    await analyzePages(makePages(13), {
      ...baseOptions,
      aiClient: createFindingPerBlockClient().aiClient,
      onProgress: (progress) => {
        progressUpdates.push(progress);
      },
    });

    expect(progressUpdates).toEqual([
      { processedBlocks: 0, totalBlocks: 3 },
      { processedBlocks: 1, totalBlocks: 3 },
      { processedBlocks: 2, totalBlocks: 3 },
      { processedBlocks: 3, totalBlocks: 3 },
    ]);
  });

  it('counts failed blocks in the progress too', async () => {
    const progressUpdates: AnalysisProgress[] = [];
    let calls = 0;
    const aiClient: AiClient = {
      analyzeBlock: () => {
        calls += 1;
        return calls === 1
          ? Promise.reject(new Error('AI failed'))
          : Promise.resolve(emptyAnswer());
      },
    };

    await analyzePages(makePages(9), {
      ...baseOptions,
      aiClient,
      onProgress: (progress) => {
        progressUpdates.push(progress);
      },
    });

    expect(progressUpdates.at(-1)).toEqual({
      processedBlocks: 2,
      totalBlocks: 2,
    });
  });

  it('adds up the tokens of the successful blocks only', async () => {
    let calls = 0;
    const aiClient: AiClient = {
      analyzeBlock: () => {
        calls += 1;
        if (calls === 2) {
          return Promise.reject(new Error('AI failed'));
        }
        return Promise.resolve({
          findings: [],
          usage: { inputTokens: 1000, outputTokens: 50 },
        });
      },
    };

    const result = await analyzePages(makePages(13), {
      ...baseOptions,
      maxConcurrency: 1,
      aiClient,
    });

    expect(result.inputTokens).toBe(2000);
    expect(result.outputTokens).toBe(100);
  });

  it('verifies, deduplicates and sorts the findings', async () => {
    // Both blocks (1–5 and 5–9) report the same quote on the overlap page 5,
    // and the second block also reports a quote that is not in the PDF.
    const aiClient: AiClient = {
      analyzeBlock: ({ blockText }) => {
        const isSecondBlock = blockText.startsWith(pageMarker(5));
        const findings = [
          {
            page: 5,
            topic: 'impuestos',
            quote: 'Texto de la página 5',
            reason: 'Ejemplo.',
            relevance: 'medium' as const,
          },
        ];
        if (isSecondBlock) {
          findings.unshift({
            page: 8,
            topic: 'impuestos',
            quote: 'Una cita inventada',
            reason: 'Ejemplo.',
            relevance: 'medium' as const,
          });
        }
        return Promise.resolve({
          findings,
          usage: { inputTokens: 0, outputTokens: 0 },
        });
      },
    };

    const result = await analyzePages(makePages(9), {
      ...baseOptions,
      aiClient,
    });

    expect(
      result.findings.map((finding) => [finding.page, finding.verification]),
    ).toEqual([
      [5, 'verified'],
      [8, 'not_found'],
    ]);
  });

  it('returns the page and block counts', async () => {
    const result = await analyzePages(makePages(13), {
      ...baseOptions,
      aiClient: createFindingPerBlockClient().aiClient,
    });

    expect(result.pageCount).toBe(13);
    expect(result.totalBlocks).toBe(3);
    expect(result.failedBlocks).toBe(0);
    expect(result.failedPages).toEqual([]);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('runAnalysis', () => {
  async function readFixture(fileName: string): Promise<Uint8Array> {
    const buffer = await readFile(
      new URL(`./fixtures/${fileName}`, import.meta.url),
    );
    return new Uint8Array(buffer);
  }

  it('reads the PDF and analyzes its pages', async () => {
    const { aiClient, analyzeBlock } = createFindingPerBlockClient();

    const result = await runAnalysis(
      await readFixture('three-pages-with-text.pdf'),
      { ...baseOptions, pagesPerBlock: 2, aiClient },
    );

    expect(result.pageCount).toBe(3);
    expect(result.totalBlocks).toBe(2);
    expect(analyzeBlock).toHaveBeenCalledTimes(2);
  });

  it('fails a scanned PDF before calling the AI', async () => {
    const { aiClient, analyzeBlock } = createFindingPerBlockClient();

    const analysis = runAnalysis(
      await readFixture('two-pages-without-text.pdf'),
      { ...baseOptions, aiClient },
    );

    await expect(analysis).rejects.toThrow(PDF_WITHOUT_TEXT_MESSAGE);
    expect(analyzeBlock).not.toHaveBeenCalled();
  });
});

describe('runWithConcurrencyLimit', () => {
  it('returns the results in the same order as the items', async () => {
    // Later items finish first, but the order of the results must not change.
    const results = await runWithConcurrencyLimit(
      [30, 20, 10],
      3,
      async (ms) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return ms * 2;
      },
    );

    expect(results).toEqual([60, 40, 20]);
  });

  it('handles an empty list', async () => {
    const results = await runWithConcurrencyLimit([], 5, () =>
      Promise.resolve(1),
    );

    expect(results).toEqual([]);
  });

  it.each([0, -1, 1.5])('throws for a limit of %s', async (limit) => {
    await expect(
      runWithConcurrencyLimit([1], limit, () => Promise.resolve(1)),
    ).rejects.toThrow(/limit/);
  });
});
