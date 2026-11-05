// A finding is one quote of the PDF related to one of the user's topics.
// Shape of `results/{id}.json` in docs/architecture.md → "Results JSON".

// Arrays first, so the values can be iterated (relevance filter, Zod enums)
// and each union type is derived from its array.
export const RELEVANCES = ['high', 'medium', 'low'] as const;
export type Relevance = (typeof RELEVANCES)[number];

// How the quote was checked against the page text (FR-07):
// - verified: the quote was found on the page the AI reported.
// - page_corrected: the quote is on another page of the same block; the page number was corrected.
// - not_found: the quote was not found in the block text.
export const VERIFICATIONS = [
  'verified',
  'page_corrected',
  'not_found',
] as const;
export type Verification = (typeof VERIFICATIONS)[number];

export interface Finding {
  /** 1-based page number in the PDF. */
  page: number;
  /** Written by the AI in the document's language (Spanish). */
  topic: string;
  /** Verbatim text from the document. */
  quote: string;
  /** Why the quote is relevant, written by the AI in Spanish. */
  reason: string;
  relevance: Relevance;
  verification: Verification;
}

/** Content of `results/{id}.json` (stored in S3, see ADR-0004). */
export interface JobResults {
  jobId: string;
  findings: Finding[];
}
