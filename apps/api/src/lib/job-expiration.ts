// Read-time expiration of jobs (FR-04, ADR-0005, docs/architecture.md → "Job states").
//
// A job that stays too long in PENDING_UPLOAD or PROCESSING is reported as FAILED.
// Nothing is written back to DynamoDB: `get-job` and `list-jobs` both call
// `applyExpiration` on every job they read, so they always agree, and no
// scheduled process is needed.

import {
  PENDING_UPLOAD_EXPIRATION_MS,
  PROCESSING_EXPIRATION_MS,
} from '@gaceta/shared';
import type { Job } from '@gaceta/shared';

/** Messages shown to the user, in Spanish. */
export const EXPIRATION_MESSAGES = {
  uploadNeverHappened: 'El PDF nunca se subió',
  analysisTookTooLong: 'El análisis tardó demasiado',
} as const;

/**
 * Returns the job as it should be shown now: `FAILED` with a message if it has
 * been waiting for too long, or the same job otherwise.
 *
 * Pure function: it never changes `job`; when the job expires it returns a copy.
 */
export function applyExpiration(job: Job, now: Date = new Date()): Job {
  if (job.status === 'PENDING_UPLOAD') {
    // The upload window starts when the job is created.
    if (hasExpired(job.createdAt, PENDING_UPLOAD_EXPIRATION_MS, now)) {
      return markAsFailed(job, EXPIRATION_MESSAGES.uploadNeverHappened);
    }
    return job;
  }

  if (job.status === 'PROCESSING') {
    // `startedAt` is set by analyze-pdf when it starts. It should always be there
    // for a PROCESSING job, but if it is missing (for example, a write that failed
    // halfway), `updatedAt` is the closest time we have, so the job can still expire
    // instead of staying in PROCESSING forever.
    const startedAt = job.startedAt ?? job.updatedAt;
    if (hasExpired(startedAt, PROCESSING_EXPIRATION_MS, now)) {
      return markAsFailed(job, EXPIRATION_MESSAGES.analysisTookTooLong);
    }
    return job;
  }

  // COMPLETED and FAILED are final states: they never expire.
  return job;
}

/** True when more than `limitMs` milliseconds have passed since `since`. */
function hasExpired(since: string, limitMs: number, now: Date): boolean {
  const elapsedMs = now.getTime() - new Date(since).getTime();
  return elapsedMs > limitMs;
}

function markAsFailed(job: Job, errorMessage: string): Job {
  return { ...job, status: 'FAILED', errorMessage };
}
