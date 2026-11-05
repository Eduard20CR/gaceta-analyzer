// How long the presigned POST returned by create-job can be used.

/** The presigned POST from create-job is valid for 15 minutes (NFR-SEC-04). */
export const UPLOAD_LINK_LIFETIME_MS = 15 * 60 * 1000;

/** The current time, saved when the job is created. */
export function uploadLinkCreatedAt(): number {
  return Date.now();
}

/**
 * Whether the upload link created at `createdAtMs` can still be used, so a
 * failed upload can be retried for the same job. After 15 minutes S3 rejects
 * it, and the only way forward is a new job.
 */
export function isUploadLinkValid(
  createdAtMs: number,
  nowMs: number = Date.now(),
): boolean {
  return nowMs - createdAtMs < UPLOAD_LINK_LIFETIME_MS;
}
