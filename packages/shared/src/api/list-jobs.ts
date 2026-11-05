// Contract of `GET /api/jobs?cursor=<cursor>` (docs/architecture.md → "API contract").

import type { Job } from '../job';

/** One row of the job history list (FR-05): only the fields the list shows. */
export type JobSummary = Pick<
  Job,
  'id' | 'name' | 'status' | 'createdAt' | 'findingsCount'
>;

/** Response `200` of `GET /api/jobs`. */
export interface ListJobsResponse {
  jobs: JobSummary[];
  /** Pass it as `?cursor=` to get the next page; `null` when there are no more pages. */
  nextCursor: string | null;
}
