// The job record shared by the web app and the API.
// Fields match the DynamoDB table `jobs` in docs/architecture.md → "Data model".

// Defined as an array first so the values can be iterated (for example, to build
// a Zod enum) and the union type below is derived from it.
export const JOB_STATUSES = [
  'PENDING_UPLOAD',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
] as const;

/** `PENDING_UPLOAD` → `PROCESSING` → `COMPLETED`, or `FAILED` (docs/architecture.md → "Job states"). */
export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * One analysis job.
 *
 * `entityType` (always "JOB", only used as the GSI partition key) is left out on
 * purpose: it is an internal DynamoDB detail that only the jobs repository knows about.
 *
 * Optional fields are only present once they are known (for example, `pageCount`
 * after the PDF is read, or `errorMessage` only when the job is `FAILED`).
 */
export interface Job {
  id: string;
  /** ISO 8601 UTC, for example "2026-11-04T20:18:00.000Z". */
  createdAt: string;
  /** ISO 8601 UTC. */
  updatedAt: string;
  name: string;
  /** The search query written by the user, for example "impuestos, aranceles". */
  query: string;
  pagesPerBlock: number;
  /** Original file name. */
  fileName: string;
  /** File size in bytes. */
  fileSize: number;
  /** S3 key of the uploaded PDF, for example "uploads/3f6c….pdf". */
  pdfKey: string;
  status: JobStatus;
  pageCount?: number;
  totalBlocks?: number;
  /** Progress: how many blocks have been analyzed so far. */
  processedBlocks?: number;
  /** Pages from blocks that failed. */
  failedPages?: number[];
  findingsCount?: number;
  /** Pages with high or medium relevance. */
  relevantPages?: number[];
  /** S3 key of the results JSON, for example "results/3f6c….json". */
  resultsKey?: string;
  /** Only when `FAILED`. In Spanish, because it is shown to the user. */
  errorMessage?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** ISO 8601 UTC. */
  startedAt?: string;
  /** ISO 8601 UTC. */
  completedAt?: string;
}
