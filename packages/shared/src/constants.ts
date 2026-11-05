// Values that the web app and the API must agree on.

/** Pages per block when the user does not change it (ADR-0012, FR-03). */
export const DEFAULT_PAGES_PER_BLOCK = 5;

/**
 * Smallest block size the user can choose (ADR-0012, FR-03).
 * Must be greater than OVERLAP_PAGES, otherwise block building would never advance.
 */
export const MIN_PAGES_PER_BLOCK = 2;

/** Pages shared by two consecutive blocks; fixed, not configurable (ADR-0012). */
export const OVERLAP_PAGES = 1;

/** Upload limit: 100 MB (FR-02, NFR-SEC-08). */
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

/** A job still in PENDING_UPLOAD after 1 h is reported as FAILED (FR-04, ADR-0005). */
export const PENDING_UPLOAD_EXPIRATION_MS = 60 * 60 * 1000;

/** A job still in PROCESSING after 20 min is reported as FAILED (FR-04, ADR-0005). */
export const PROCESSING_EXPIRATION_MS = 20 * 60 * 1000;

/** Jobs per page in the history list (FR-05). */
export const JOBS_PAGE_SIZE = 20;

/** How often the web app asks for a job's status while it is processing (FR-04). */
export const POLLING_INTERVAL_MS = 4000;
