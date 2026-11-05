// Contract of `GET /api/jobs/{id}` (docs/architecture.md → "API contract").

import type { Finding } from '../finding';
import type { Job } from '../job';

/** Response `200` of `GET /api/jobs/{id}`. */
export interface GetJobResponse {
  job: Job;
  /** Only present when the job is `COMPLETED`. */
  findings?: Finding[];
  /** Presigned read URL of the PDF (15 min), or `null` if the PDF was already deleted. */
  pdfUrl: string | null;
}
