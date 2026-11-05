// GET /api/jobs/{id} (FR-04, docs/architecture.md → "API contract").
//
// Returns the job as it should be shown now (expiration applied, #18), its
// findings when it is COMPLETED (read from S3, ADR-0004) and a 15-minute read
// URL of the PDF, or `null` once the PDF was deleted (NFR-SEC-06, FR-06).
// The web app polls this route every few seconds, so it must stay fast (NFR-PERF-03).

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

import type { Finding, GetJobResponse, Job } from '@gaceta/shared';

import { internalError, jsonResponse, notFound } from '../lib/http';
import { applyExpiration } from '../lib/job-expiration';
import { getJob } from '../lib/jobs-repository';
import { createLogger } from '../lib/logger';
import { createPdfReadUrl, getResults } from '../lib/storage';

/** Shown to the user, in Spanish. */
export const JOB_NOT_FOUND_MESSAGE = 'El análisis no existe';

// Ids are created by `crypto.randomUUID()`. Anything else cannot be a job, so
// it gets a 404 without asking DynamoDB.
const JOB_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const id = event.pathParameters?.['id'];
  if (id === undefined || !JOB_ID_PATTERN.test(id)) {
    return notFound(JOB_NOT_FOUND_MESSAGE);
  }

  const log = createLogger({ jobId: id });

  try {
    const storedJob = await getJob(id);
    if (storedJob === null) {
      return notFound(JOB_NOT_FOUND_MESSAGE);
    }

    const job = applyExpiration(storedJob);

    // The two S3 calls do not depend on each other, so they run at the same time.
    const [findings, pdfUrl] = await Promise.all([
      readFindings(job),
      createPdfReadUrl(job.pdfKey),
    ]);

    return jsonResponse(200, buildResponse(job, findings, pdfUrl));
  } catch (error) {
    log.error('Could not read the job', { error });
    return internalError();
  }
}

/** The findings of a COMPLETED job, or `undefined` for any other status. */
async function readFindings(job: Job): Promise<Finding[] | undefined> {
  if (job.status !== 'COMPLETED' || job.resultsKey === undefined) {
    return undefined;
  }
  const results = await getResults(job.resultsKey);
  return results.findings;
}

function buildResponse(
  job: Job,
  findings: Finding[] | undefined,
  pdfUrl: string | null,
): GetJobResponse {
  // `findings` is left out (not set to `undefined`) when there are none, so the
  // JSON matches the contract: the key only exists for COMPLETED jobs.
  if (findings === undefined) {
    return { job, pdfUrl };
  }
  return { job, findings, pdfUrl };
}
