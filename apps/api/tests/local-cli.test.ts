import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import type { Finding } from '@gaceta/shared';

import {
  CliUsageError,
  formatFinding,
  formatProgress,
  formatResult,
  formatResultsJson,
  parseCliArguments,
  runCli,
} from '../scripts/local-cli';
import type { CliDependencies } from '../scripts/local-cli';
import type { AiClient } from '../src/lib/ai-client';
import type { AnalysisResult } from '../src/lib/analysis';

// No test calls DeepSeek: the CLI gets a fake AI client.

const env = { DEEPSEEK_API_KEY: 'secret-test-key' };
const baseArgs = ['gaceta.pdf', '--query', 'impuestos, aranceles'];

describe('parseCliArguments', () => {
  it('reads the PDF path, the query and the defaults', () => {
    expect(parseCliArguments(baseArgs, env)).toEqual({
      pdfPath: 'gaceta.pdf',
      query: 'impuestos, aranceles',
      pagesPerBlock: 5,
      concurrency: 5,
      outPath: undefined,
      apiKey: 'secret-test-key',
      model: 'deepseek-v4-flash',
    });
  });

  it('reads every option and the model', () => {
    const parsed = parseCliArguments(
      [
        ...baseArgs,
        '--pages-per-block',
        '8',
        '--concurrency',
        '2',
        '--out',
        'results.json',
      ],
      { ...env, DEEPSEEK_MODEL: 'deepseek-v5' },
    );

    expect(parsed.pagesPerBlock).toBe(8);
    expect(parsed.concurrency).toBe(2);
    expect(parsed.outPath).toBe('results.json');
    expect(parsed.model).toBe('deepseek-v5');
  });

  it('fails when DEEPSEEK_API_KEY is missing or empty', () => {
    expect(() => parseCliArguments(baseArgs, {})).toThrow(
      'The DEEPSEEK_API_KEY environment variable is not set.',
    );
    expect(() =>
      parseCliArguments(baseArgs, { DEEPSEEK_API_KEY: '  ' }),
    ).toThrow(CliUsageError);
  });

  it.each(['1', '0', '2.5', 'five', ''])(
    'fails for --pages-per-block "%s"',
    (value) => {
      expect(() =>
        parseCliArguments([...baseArgs, '--pages-per-block', value], env),
      ).toThrow(/--pages-per-block must be a whole number of at least 2/);
    },
  );

  it('fails for --concurrency 0', () => {
    expect(() =>
      parseCliArguments([...baseArgs, '--concurrency', '0'], env),
    ).toThrow(/--concurrency must be a whole number of at least 1/);
  });

  it('fails without a query', () => {
    expect(() => parseCliArguments(['gaceta.pdf'], env)).toThrow(
      '--query is required.',
    );
  });

  it('fails without a PDF path, or with two', () => {
    expect(() => parseCliArguments(['--query', 'impuestos'], env)).toThrow(
      'Pass exactly one PDF path.',
    );
    expect(() =>
      parseCliArguments(['a.pdf', 'b.pdf', '--query', 'impuestos'], env),
    ).toThrow('Pass exactly one PDF path.');
  });

  it('fails for an unknown option', () => {
    expect(() => parseCliArguments([...baseArgs, '--foo'], env)).toThrow(
      CliUsageError,
    );
  });
});

const finding: Finding = {
  page: 14,
  topic: 'impuestos',
  quote: 'Se reforma el impuesto sobre la renta',
  reason: 'Modifica un impuesto.',
  relevance: 'high',
  verification: 'verified',
};

const result: AnalysisResult = {
  findings: [finding],
  pageCount: 116,
  totalBlocks: 29,
  failedBlocks: 1,
  failedPages: [6, 7, 8],
  findingsCount: 1,
  relevantPages: [14],
  inputTokens: 250000,
  outputTokens: 4000,
  durationMs: 95400,
};

describe('output formatting', () => {
  it('formats progress', () => {
    expect(formatProgress(0, 30)).toBe('Analyzing 30 blocks…');
    expect(formatProgress(7, 30)).toBe('Block 7 of 30');
  });

  it('prints the summary', () => {
    const lines = formatResult(result);

    expect(lines).toContain('  Pages:          116');
    expect(lines).toContain('  Blocks:         29 (1 failed)');
    expect(lines).toContain('  Failed pages:   6, 7, 8');
    expect(lines).toContain('  Findings:       1');
    expect(lines).toContain('  Relevant pages: 14');
    expect(lines).toContain('  Tokens:         250000 in, 4000 out');
    expect(lines).toContain('  Duration:       95.4 s');
  });

  it('says "none" for empty page lists and prints no findings section', () => {
    const lines = formatResult({
      ...result,
      findings: [],
      findingsCount: 0,
      failedPages: [],
      relevantPages: [],
    });

    expect(lines).toContain('  Failed pages:   none');
    expect(lines).toContain('  Relevant pages: none');
    expect(lines).not.toContain('Findings');
  });

  it('prints page, relevance, verification, topic and quote of a finding', () => {
    expect(formatFinding(finding)).toEqual([
      '  Page 14 · high · verified',
      '  Topic:  impuestos',
      '  Quote:  "Se reforma el impuesto sobre la renta"',
      '  Reason: Modifica un impuesto.',
    ]);
  });

  it('writes the results JSON in the shape of results/{id}.json', () => {
    const json = JSON.parse(formatResultsJson([finding])) as unknown;

    expect(json).toEqual({ jobId: 'local', findings: [finding] });
  });
});

describe('runCli', () => {
  async function readFixture(fileName: string): Promise<Uint8Array> {
    const buffer = await readFile(
      new URL(`./fixtures/${fileName}`, import.meta.url),
    );
    return new Uint8Array(buffer);
  }

  /** Fake dependencies that record everything the CLI prints and writes. */
  function createFakeDependencies(pdfFixture: string) {
    const printed: string[] = [];
    const progress: string[] = [];
    const written = new Map<string, string>();
    const analyzeBlock = vi.fn<AiClient['analyzeBlock']>(() =>
      Promise.resolve({
        findings: [
          {
            page: 1,
            topic: 'impuestos',
            quote: 'impuestos sobre la renta',
            reason: 'Menciona impuestos.',
            relevance: 'high',
          },
        ],
        usage: { inputTokens: 10, outputTokens: 2 },
      }),
    );
    const createAiClient = vi.fn(() => ({ analyzeBlock }));
    const dependencies: CliDependencies = {
      readFile: () => readFixture(pdfFixture),
      writeFile: (path, content) => {
        written.set(path, content);
        return Promise.resolve();
      },
      createAiClient,
      print: (line) => printed.push(line),
      printProgress: (line) => progress.push(line),
    };
    return {
      dependencies,
      printed,
      progress,
      written,
      analyzeBlock,
      createAiClient,
    };
  }

  it('analyzes the PDF, prints progress, the summary and the findings', async () => {
    const fake = createFakeDependencies('three-pages-with-text.pdf');

    const exitCode = await runCli(
      [...baseArgs, '--pages-per-block', '2', '--out', 'results.json'],
      env,
      fake.dependencies,
    );

    expect(exitCode).toBe(0);
    expect(fake.progress).toContain('Block 2 of 2');
    expect(fake.printed).toContain('  Pages:          3');
    expect(fake.printed).toContain('  Page 1 · high · verified');
    expect(fake.written.has('results.json')).toBe(true);
    expect(fake.createAiClient).toHaveBeenCalledWith({
      apiKey: 'secret-test-key',
      model: 'deepseek-v4-flash',
    });
  });

  it('exits with 1 and makes no AI call when the key is missing', async () => {
    const fake = createFakeDependencies('three-pages-with-text.pdf');

    const exitCode = await runCli(baseArgs, {}, fake.dependencies);

    expect(exitCode).toBe(1);
    expect(fake.progress.join('\n')).toContain('DEEPSEEK_API_KEY');
    expect(fake.createAiClient).not.toHaveBeenCalled();
  });

  it('exits with 1 before any AI call when --pages-per-block is invalid', async () => {
    const fake = createFakeDependencies('three-pages-with-text.pdf');

    const exitCode = await runCli(
      [...baseArgs, '--pages-per-block', '1'],
      env,
      fake.dependencies,
    );

    expect(exitCode).toBe(1);
    expect(fake.analyzeBlock).not.toHaveBeenCalled();
  });

  it('exits with 1 and the Spanish message for a PDF without text', async () => {
    const fake = createFakeDependencies('two-pages-without-text.pdf');

    const exitCode = await runCli(baseArgs, env, fake.dependencies);

    expect(exitCode).toBe(1);
    expect(fake.progress).toContain(
      'Error: El PDF no contiene texto. Puede ser un documento escaneado',
    );
  });

  it('never prints the API key or the full page text', async () => {
    const fake = createFakeDependencies('three-pages-with-text.pdf');

    await runCli(baseArgs, env, fake.dependencies);

    const everything = [...fake.printed, ...fake.progress].join('\n');
    expect(everything).not.toContain('secret-test-key');
    // A sentence of page 2 that is not part of any finding.
    expect(everything).not.toContain('aranceles de importación y exportación');
  });
});
