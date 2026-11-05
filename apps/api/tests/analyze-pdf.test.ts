import { readFile } from 'node:fs/promises';

import type { S3Event } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Job } from '@gaceta/shared';

import { UNEXPECTED_ERROR_MESSAGE, handler } from '../src/handlers/analyze-pdf';
import { createAiClient } from '../src/lib/ai-client';
import type * as AiClientModule from '../src/lib/ai-client';
import type { AiClient } from '../src/lib/ai-client';
import { ALL_BLOCKS_FAILED_MESSAGE } from '../src/lib/analysis';
import { getSecureParameter } from '../src/lib/config';
import type * as ConfigModule from '../src/lib/config';
import {
  completeJob,
  failJob,
  getJob,
  startProcessing,
} from '../src/lib/jobs-repository';
import { PDF_WITHOUT_TEXT_MESSAGE } from '../src/lib/pdf';
import { getPdfBytes, putResults } from '../src/lib/storage';
import type * as StorageModule from '../src/lib/storage';

// The handler is tested on its own: DynamoDB, S3, SSM and DeepSeek are replaced
// by fakes. The analysis pipeline and the PDF reading are the real ones, fed
// with the small fixture PDFs, so these tests also show they fit together.

vi.mock('../src/lib/jobs-repository', () => ({
  startProcessing: vi.fn(),
  getJob: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
}));
vi.mock('../src/lib/storage', async (importOriginal) => {
  const original = await importOriginal<typeof StorageModule>();
  // The key functions stay real: they are pure and their format matters.
  return { ...original, getPdfBytes: vi.fn(), putResults: vi.fn() };
});
vi.mock('../src/lib/config', async (importOriginal) => {
  const original = await importOriginal<typeof ConfigModule>();
  return { ...original, getSecureParameter: vi.fn() };
});
vi.mock('../src/lib/ai-client', async (importOriginal) => {
  const original = await importOriginal<typeof AiClientModule>();
  return { ...original, createAiClient: vi.fn() };
});

const ID = '3f6c2a1e-1111-4222-8333-444455556666';
const FAKE_API_KEY = 'sk-test-not-a-real-key';

const JOB: Job = {
  id: ID,
  createdAt: '2026-11-05T20:00:00.000Z',
  updatedAt: '2026-11-05T20:00:10.000Z',
  name: 'Gaceta 4 nov',
  query: 'impuestos, aranceles',
  // The fixture has 3 pages, so blocks are [1, 2] and [2, 3].
  pagesPerBlock: 2,
  fileName: 'gaceta.pdf',
  fileSize: 1234,
  pdfKey: `uploads/${ID}.pdf`,
  status: 'PROCESSING',
};

function readFixture(name: string): Promise<Uint8Array> {
  // A new array every time: pdf.js may empty the one it reads.
  return readFile(new URL(`./fixtures/${name}`, import.meta.url)).then(
    (buffer) => new Uint8Array(buffer),
  );
}

/** An S3 ObjectCreated event with one record per key. */
function s3EventFor(...keys: string[]): S3Event {
  const records = keys.map((key) => ({ s3: { object: { key } } }));
  // The real record has many fields (bucket, eventTime, …) the handler never reads.
  return { Records: records } as unknown as S3Event;
}

/** True when the block sent to the AI contains that page. */
function blockHasPage(blockText: string, pageNumber: number): boolean {
  return blockText.includes(`--- PAGE ${pageNumber} ---`);
}

/**
 * Fake DeepSeek: reports the quote of page 1 when the block includes page 1,
 * and nothing otherwise. Each call uses 100 input and 10 output tokens.
 */
const analyzeBlock = vi.fn<AiClient['analyzeBlock']>();

function answerWithPageOneFinding(input: { blockText: string }) {
  const findings = blockHasPage(input.blockText, 1)
    ? [
        {
          page: 1,
          topic: 'impuestos',
          quote: 'impuestos sobre la renta',
          reason: 'Habla de impuestos.',
          relevance: 'high' as const,
        },
      ]
    : [];
  return Promise.resolve({
    findings,
    usage: { inputTokens: 100, outputTokens: 10 },
  });
}

/** Every line written by the logger during the test. */
function allLogLines(): string[] {
  const calls = [
    ...vi.mocked(console.log).mock.calls,
    ...vi.mocked(console.error).mock.calls,
  ];
  return calls.map((args) => args.join(' '));
}

function logEntry(message: string): Record<string, unknown> | undefined {
  const entries = allLogLines().map(
    (line) => JSON.parse(line) as Record<string, unknown>,
  );
  return entries.find((entry) => entry['message'] === message);
}

beforeEach(async () => {
  vi.mocked(startProcessing).mockReset().mockResolvedValue(true);
  vi.mocked(getJob).mockReset().mockResolvedValue(JOB);
  vi.mocked(completeJob).mockReset().mockResolvedValue(undefined);
  vi.mocked(failJob).mockReset().mockResolvedValue(undefined);
  vi.mocked(putResults).mockReset().mockResolvedValue(undefined);
  vi.mocked(getPdfBytes)
    .mockReset()
    .mockResolvedValue(await readFixture('three-pages-with-text.pdf'));
  vi.mocked(getSecureParameter).mockReset().mockResolvedValue(FAKE_API_KEY);
  analyzeBlock.mockReset().mockImplementation(answerWithPageOneFinding);
  vi.mocked(createAiClient).mockReset().mockReturnValue({ analyzeBlock });

  vi.stubEnv('DEEPSEEK_API_KEY_PARAM', '/gaceta-analyzer/deepseek-api-key');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('analyze-pdf handler', () => {
  it('does nothing for a duplicate event', async () => {
    vi.mocked(startProcessing).mockResolvedValue(false);

    await handler(s3EventFor(`uploads/${ID}.pdf`));

    expect(startProcessing).toHaveBeenCalledWith(ID);
    expect(getPdfBytes).not.toHaveBeenCalled();
    expect(analyzeBlock).not.toHaveBeenCalled();
    expect(completeJob).not.toHaveBeenCalled();
    expect(failJob).not.toHaveBeenCalled();
    expect(logEntry('Duplicate event ignored')?.['jobId']).toBe(ID);
  });

  it('ignores keys this app did not create', async () => {
    await handler(s3EventFor('uploads/not-a-job.pdf', 'other/file.pdf'));

    expect(startProcessing).not.toHaveBeenCalled();
    expect(getPdfBytes).not.toHaveBeenCalled();
  });

  it('stores the results and completes the job on the happy path', async () => {
    await handler(s3EventFor(`uploads/${ID}.pdf`));

    expect(getSecureParameter).toHaveBeenCalledWith(
      '/gaceta-analyzer/deepseek-api-key',
    );
    expect(createAiClient).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: FAKE_API_KEY }),
    );
    expect(getPdfBytes).toHaveBeenCalledWith(JOB.pdfKey);
    expect(analyzeBlock).toHaveBeenCalledWith(
      expect.objectContaining({ query: JOB.query }),
    );

    expect(putResults).toHaveBeenCalledWith(ID, {
      jobId: ID,
      findings: [
        {
          page: 1,
          topic: 'impuestos',
          quote: 'impuestos sobre la renta',
          reason: 'Habla de impuestos.',
          relevance: 'high',
          verification: 'verified',
        },
      ],
    });
    expect(completeJob).toHaveBeenCalledWith(ID, {
      pageCount: 3,
      totalBlocks: 2,
      findingsCount: 1,
      relevantPages: [1],
      resultsKey: `results/${ID}.json`,
      failedPages: [],
      inputTokens: 200,
      outputTokens: 20,
    });
    expect(failJob).not.toHaveBeenCalled();
  });

  it('completes the job with failedPages when some blocks fail', async () => {
    // The second block (pages 2 and 3) fails. Page 2 was read by the first
    // block, so only page 3 is reported as missing.
    analyzeBlock.mockImplementation((input) =>
      blockHasPage(input.blockText, 3)
        ? Promise.reject(new Error('AI failed'))
        : answerWithPageOneFinding(input),
    );

    await handler(s3EventFor(`uploads/${ID}.pdf`));

    expect(completeJob).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({
        failedPages: [3],
        findingsCount: 1,
        inputTokens: 100,
        outputTokens: 10,
      }),
    );
    expect(failJob).not.toHaveBeenCalled();
  });

  it('fails the job with a Spanish message when every block fails', async () => {
    analyzeBlock.mockRejectedValue(new Error('AI failed'));

    await handler(s3EventFor(`uploads/${ID}.pdf`));

    expect(failJob).toHaveBeenCalledWith(ID, ALL_BLOCKS_FAILED_MESSAGE);
    expect(completeJob).not.toHaveBeenCalled();
    expect(putResults).not.toHaveBeenCalled();
  });

  it('fails the job when the PDF has no text, without calling the AI', async () => {
    vi.mocked(getPdfBytes).mockResolvedValue(
      await readFixture('two-pages-without-text.pdf'),
    );

    await handler(s3EventFor(`uploads/${ID}.pdf`));

    expect(failJob).toHaveBeenCalledWith(ID, PDF_WITHOUT_TEXT_MESSAGE);
    expect(PDF_WITHOUT_TEXT_MESSAGE).toBe(
      'El PDF no contiene texto. Puede ser un documento escaneado',
    );
    expect(analyzeBlock).not.toHaveBeenCalled();
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('fails the job with a generic Spanish message on an unexpected error', async () => {
    vi.mocked(getPdfBytes).mockRejectedValue(new Error('S3 is down'));

    await expect(
      handler(s3EventFor(`uploads/${ID}.pdf`)),
    ).resolves.toBeUndefined();

    expect(failJob).toHaveBeenCalledWith(ID, UNEXPECTED_ERROR_MESSAGE);
    expect(completeJob).not.toHaveBeenCalled();
    const logged = logEntry('Analysis failed');
    expect(logged?.['jobId']).toBe(ID);
  });

  it('fails the job when storing the results fails', async () => {
    vi.mocked(putResults).mockRejectedValue(new Error('S3 is down'));

    await handler(s3EventFor(`uploads/${ID}.pdf`));

    expect(failJob).toHaveBeenCalledWith(ID, UNEXPECTED_ERROR_MESSAGE);
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('logs and does not throw when the job cannot even be marked FAILED', async () => {
    vi.mocked(getPdfBytes).mockRejectedValue(new Error('S3 is down'));
    vi.mocked(failJob).mockRejectedValue(new Error('DynamoDB is down'));

    await expect(
      handler(s3EventFor(`uploads/${ID}.pdf`)),
    ).resolves.toBeUndefined();

    expect(logEntry('Could not mark the job as FAILED')?.['jobId']).toBe(ID);
  });

  it('lets Lambda retry when the job cannot be started', async () => {
    // Nothing changed yet, so the retry can still start the job normally.
    vi.mocked(startProcessing).mockRejectedValue(new Error('DynamoDB is down'));

    await expect(handler(s3EventFor(`uploads/${ID}.pdf`))).rejects.toThrow(
      'DynamoDB is down',
    );
    expect(failJob).not.toHaveBeenCalled();
  });

  it('logs the analysis metrics at the end, without any text of the PDF', async () => {
    await handler(s3EventFor(`uploads/${ID}.pdf`));

    const metrics = logEntry('Analysis completed');
    expect(metrics).toMatchObject({
      jobId: ID,
      pageCount: 3,
      totalBlocks: 2,
      failedBlocks: 0,
      findingsCount: 1,
      inputTokens: 200,
      outputTokens: 20,
    });
    expect(metrics?.['durationMs']).toBeTypeOf('number');

    // Words of the fixture PDF, the query and the quote: none may be logged.
    const everything = allLogLines().join('\n');
    expect(everything).not.toContain('impuestos');
    expect(everything).not.toContain('renta');
    expect(everything).not.toContain('aranceles');
    expect(everything).not.toContain(FAKE_API_KEY);
  });
});
