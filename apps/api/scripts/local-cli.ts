// Logic of the local CLI (scripts/analyze-local.ts), kept apart from the entry
// point so tests can call it with fake files, a fake AI client and a fake
// output instead of running a process.
//
// The CLI is a developer tool, so its messages are in English. It prints the
// findings (that is its purpose) but never the API key or the full PDF text.

import { parseArgs } from 'node:util';

import { DEFAULT_PAGES_PER_BLOCK, MIN_PAGES_PER_BLOCK } from '@gaceta/shared';
import type { Finding, JobResults } from '@gaceta/shared';

import type { AiClient } from '../src/lib/ai-client';
import { DEFAULT_MAX_CONCURRENCY, runAnalysis } from '../src/lib/analysis';
import type { AnalysisResult } from '../src/lib/analysis';

export const DEFAULT_MODEL = 'deepseek-v4-flash';

export const USAGE = `Usage: npm run analyze:local -w @gaceta/api -- <pdf-path> --query "impuestos, aranceles" [--pages-per-block 5] [--concurrency 5] [--out results.json]

Environment variables:
  DEEPSEEK_API_KEY  required
  DEEPSEEK_MODEL    optional, default ${DEFAULT_MODEL}`;

export interface CliArguments {
  pdfPath: string;
  query: string;
  pagesPerBlock: number;
  concurrency: number;
  outPath: string | undefined;
  apiKey: string;
  model: string;
}

/** A problem with the arguments or the environment. Its message is shown as is. */
export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

/**
 * Reads and checks the command-line arguments and environment variables.
 * Throws `CliUsageError` before anything is read or any AI call is made.
 */
export function parseCliArguments(
  argv: string[],
  env: Record<string, string | undefined>,
): CliArguments {
  const parsed = parseArgsOrThrow(argv);

  const pdfPath = parsed.positionals[0];
  if (pdfPath === undefined || parsed.positionals.length > 1) {
    throw new CliUsageError('Pass exactly one PDF path.');
  }

  const query = parsed.values.query?.trim() ?? '';
  if (query === '') {
    throw new CliUsageError('--query is required.');
  }

  const pagesPerBlock = parseWholeNumber(
    parsed.values['pages-per-block'],
    '--pages-per-block',
    MIN_PAGES_PER_BLOCK,
    DEFAULT_PAGES_PER_BLOCK,
  );
  const concurrency = parseWholeNumber(
    parsed.values.concurrency,
    '--concurrency',
    1,
    DEFAULT_MAX_CONCURRENCY,
  );

  const apiKey = env['DEEPSEEK_API_KEY']?.trim() ?? '';
  if (apiKey === '') {
    throw new CliUsageError(
      'The DEEPSEEK_API_KEY environment variable is not set.',
    );
  }
  const model = env['DEEPSEEK_MODEL']?.trim() || DEFAULT_MODEL;

  return {
    pdfPath,
    query,
    pagesPerBlock,
    concurrency,
    outPath: parsed.values.out,
    apiKey,
    model,
  };
}

function parseArgsOrThrow(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        query: { type: 'string' },
        'pages-per-block': { type: 'string' },
        concurrency: { type: 'string' },
        out: { type: 'string' },
      },
    });
  } catch (error) {
    // parseArgs explains unknown options well ("Unknown option '--foo'").
    const message = error instanceof Error ? error.message : String(error);
    throw new CliUsageError(message);
  }
}

function parseWholeNumber(
  value: string | undefined,
  optionName: string,
  minimum: number,
  defaultValue: number,
): number {
  if (value === undefined) {
    return defaultValue;
  }
  // Number('') is 0 and Number('2.5') is 2.5, so both are rejected below.
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new CliUsageError(
      `${optionName} must be a whole number of at least ${minimum}, got "${value}".`,
    );
  }
  return number;
}

/** Everything the CLI touches outside itself, so tests can replace it. */
export interface CliDependencies {
  readFile: (path: string) => Promise<Uint8Array>;
  writeFile: (path: string, content: string) => Promise<void>;
  createAiClient: (options: { apiKey: string; model: string }) => AiClient;
  /** Results go to stdout. */
  print: (line: string) => void;
  /** Progress and errors go to stderr, so stdout can be redirected to a file. */
  printProgress: (line: string) => void;
}

/** Runs the CLI and returns the process exit code. */
export async function runCli(
  argv: string[],
  env: Record<string, string | undefined>,
  dependencies: CliDependencies,
): Promise<number> {
  let cliArguments: CliArguments;
  try {
    cliArguments = parseCliArguments(argv, env);
  } catch (error) {
    if (error instanceof CliUsageError) {
      dependencies.printProgress(`Error: ${error.message}\n\n${USAGE}`);
      return 1;
    }
    throw error;
  }

  try {
    const result = await analyze(cliArguments, dependencies);
    for (const line of formatResult(result)) {
      dependencies.print(line);
    }
    if (cliArguments.outPath !== undefined) {
      const json = formatResultsJson(result.findings);
      await dependencies.writeFile(cliArguments.outPath, json);
      dependencies.printProgress(`Results written to ${cliArguments.outPath}`);
    }
    return 0;
  } catch (error) {
    // Error messages from the pipeline never contain the PDF text or the key.
    const message = error instanceof Error ? error.message : String(error);
    dependencies.printProgress(`Error: ${message}`);
    return 1;
  }
}

async function analyze(
  cliArguments: CliArguments,
  dependencies: CliDependencies,
): Promise<AnalysisResult> {
  const pdfBytes = await dependencies.readFile(cliArguments.pdfPath);
  const aiClient = dependencies.createAiClient({
    apiKey: cliArguments.apiKey,
    model: cliArguments.model,
  });

  return runAnalysis(pdfBytes, {
    query: cliArguments.query,
    pagesPerBlock: cliArguments.pagesPerBlock,
    maxConcurrency: cliArguments.concurrency,
    aiClient,
    onProgress: ({ processedBlocks, totalBlocks }) => {
      dependencies.printProgress(formatProgress(processedBlocks, totalBlocks));
    },
  });
}

export function formatProgress(
  processedBlocks: number,
  totalBlocks: number,
): string {
  if (processedBlocks === 0) {
    return `Analyzing ${totalBlocks} blocks…`;
  }
  return `Block ${processedBlocks} of ${totalBlocks}`;
}

/** The summary first, then one entry per finding. */
export function formatResult(result: AnalysisResult): string[] {
  const lines = [
    '',
    'Summary',
    `  Pages:          ${result.pageCount}`,
    `  Blocks:         ${result.totalBlocks} (${result.failedBlocks} failed)`,
    `  Failed pages:   ${formatPageList(result.failedPages)}`,
    `  Findings:       ${result.findingsCount}`,
    `  Relevant pages: ${formatPageList(result.relevantPages)}`,
    `  Tokens:         ${result.inputTokens} in, ${result.outputTokens} out`,
    `  Duration:       ${formatDuration(result.durationMs)}`,
  ];

  if (result.findings.length > 0) {
    lines.push('', 'Findings');
  }
  for (const finding of result.findings) {
    lines.push('', ...formatFinding(finding));
  }
  return lines;
}

export function formatFinding(finding: Finding): string[] {
  return [
    `  Page ${finding.page} · ${finding.relevance} · ${finding.verification}`,
    `  Topic:  ${finding.topic}`,
    `  Quote:  "${finding.quote}"`,
    `  Reason: ${finding.reason}`,
  ];
}

function formatPageList(pages: number[]): string {
  return pages.length === 0 ? 'none' : pages.join(', ');
}

function formatDuration(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)} s`;
}

/** Same shape as `results/{id}.json` in S3 (ADR-0004). */
export function formatResultsJson(findings: Finding[]): string {
  // There is no job in a local run, so the id says where the file came from.
  const results: JobResults = { jobId: 'local', findings };
  return `${JSON.stringify(results, null, 2)}\n`;
}
