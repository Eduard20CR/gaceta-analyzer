// analyze-pdf: triggered by S3 when a PDF lands in `uploads/` (FR-03,
// docs/architecture.md → "Main flow" step 3, ADR-0005).
//
// The analysis itself lives in `lib/analysis.ts`; this handler connects it to
// S3, DynamoDB and SSM:
//   upload key → job id → PENDING_UPLOAD to PROCESSING (conditional) →
//   download the PDF → runAnalysis → store results → COMPLETED.
//
// No progress is stored while the analysis runs (ADR-0014): the job only
// changes when it starts and when it ends.
//
// Rules this file has to keep:
// - Idempotent (NFR-REL-02): S3 may deliver the same event twice. Only the
//   invocation that wins the conditional PENDING_UPLOAD → PROCESSING write works
//   on the job; the others stop right away.
// - Never stuck in PROCESSING (NFR-REL-03): any error after that write leaves the
//   job FAILED with a Spanish message the user can act on (NFR-UX-04).
// - Once the job is PROCESSING, never rethrow: a thrown error makes Lambda retry
//   the event, but the job is no longer PENDING_UPLOAD, so the retry would only
//   be ignored. Before that point, rethrowing is what lets the retry do the work.
// - NEVER log the PDF text, the query or the quotes (NFR-OBS-03).

import type { S3Event, S3EventRecord } from 'aws-lambda';

import type { Job } from '@gaceta/shared';

import { createAiClient } from '../lib/ai-client';
import type { AiClient } from '../lib/ai-client';
import { AllBlocksFailedError, runAnalysis } from '../lib/analysis';
import type { AnalysisResult } from '../lib/analysis';
import {
  getDeepSeekApiKeyParam,
  getDeepSeekModel,
  getMaxConcurrency,
  getSecureParameter,
} from '../lib/config';
import {
  completeJob,
  failJob,
  getJob,
  startProcessing,
} from '../lib/jobs-repository';
import { createLogger } from '../lib/logger';
import type { Logger } from '../lib/logger';
import { PdfWithoutTextError } from '../lib/pdf';
import {
  getPdfBytes,
  jobIdFromUploadKey,
  putResults,
  resultsKey,
} from '../lib/storage';

/** Stored as `errorMessage` for any error we did not expect. Spanish: the user sees it. */
export const UNEXPECTED_ERROR_MESSAGE =
  'Ocurrió un error inesperado al analizar el PDF. Intente de nuevo.';

export async function handler(event: S3Event): Promise<void> {
  // S3 usually sends one record per event, but the format allows several.
  // They are handled one after the other to keep the AI concurrency limit.
  for (const record of event.Records) {
    await handleRecord(record);
  }
}

async function handleRecord(record: S3EventRecord): Promise<void> {
  const key = record.s3.object.key;
  const jobId = jobIdFromUploadKey(key);
  if (jobId === null) {
    // Not a key this app creates (for example, a file uploaded by hand).
    createLogger().warn('Unknown upload key ignored', { key });
    return;
  }

  const log = createLogger({ jobId });

  // If this write throws (for example, DynamoDB is briefly unavailable), the
  // error is not caught on purpose: Lambda retries the event, and the retry
  // either starts the job or sees that another invocation already did. Marking
  // the job FAILED here could break a job that another invocation is analyzing.
  const started = await startProcessing(jobId);
  if (!started) {
    // Another invocation already took this job (duplicate event), or the job
    // does not exist. Either way there is nothing to do.
    log.info('Duplicate event ignored');
    return;
  }

  const startedAt = Date.now();
  try {
    await analyzeJob(jobId, log);
  } catch (error) {
    log.error('Analysis failed', {
      error,
      durationMs: Date.now() - startedAt,
    });
    await failSafely(jobId, userMessageFor(error), log);
  }
}

/** Everything that happens once the job is ours. Throws on any failure. */
async function analyzeJob(jobId: string, log: Logger): Promise<void> {
  const job = await getJob(jobId);
  if (job === null) {
    // startProcessing just updated it, so this should never happen.
    throw new Error('Job not found after starting it');
  }

  const aiClient = await buildAiClient(log);
  const pdfBytes = await getPdfBytes(job.pdfKey);

  const result = await runAnalysis(pdfBytes, {
    query: job.query,
    pagesPerBlock: job.pagesPerBlock,
    maxConcurrency: getMaxConcurrency(),
    aiClient,
    logger: log,
  });

  await saveResults(job, result);
  logMetrics(result, log);
}

/** The DeepSeek key is read from SSM (cached per container) and never logged. */
async function buildAiClient(log: Logger): Promise<AiClient> {
  const apiKey = await getSecureParameter(getDeepSeekApiKeyParam());
  return createAiClient({ apiKey, model: getDeepSeekModel(), logger: log });
}

async function saveResults(job: Job, result: AnalysisResult): Promise<void> {
  await putResults(job.id, { jobId: job.id, findings: result.findings });
  await completeJob(job.id, {
    pageCount: result.pageCount,
    totalBlocks: result.totalBlocks,
    findingsCount: result.findingsCount,
    relevantPages: result.relevantPages,
    resultsKey: resultsKey(job.id),
    failedPages: result.failedPages,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });
}

/** The summary of a finished analysis (NFR-OBS-02). Counts only, no text. */
function logMetrics(result: AnalysisResult, log: Logger): void {
  log.info('Analysis completed', {
    pageCount: result.pageCount,
    totalBlocks: result.totalBlocks,
    failedBlocks: result.failedBlocks,
    findingsCount: result.findingsCount,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    durationMs: result.durationMs,
  });
}

/**
 * The message stored on the job. The errors the user can understand already
 * carry a Spanish message; anything else gets the generic one, because its
 * message is technical and in English.
 */
function userMessageFor(error: unknown): string {
  if (error instanceof PdfWithoutTextError) {
    return error.message;
  }
  if (error instanceof AllBlocksFailedError) {
    return error.message;
  }
  return UNEXPECTED_ERROR_MESSAGE;
}

/** Marks the job FAILED. If even that fails, it logs and returns (see the top comment). */
async function failSafely(
  jobId: string,
  message: string,
  log: Logger,
): Promise<void> {
  try {
    await failJob(jobId, message);
  } catch (error) {
    log.error('Could not mark the job as FAILED', { error });
  }
}
