// Calculations for the job page (FR-04), as pure functions so they can be
// tested without rendering anything.

import { RELEVANCES } from '@gaceta/shared';
import type { Finding, JobStatus, Relevance } from '@gaceta/shared';

/** The relevance filter: one relevance, or every finding. */
export type RelevanceFilter = Relevance | 'all';

/** While the job is in one of these, the page keeps asking for its status. */
export function isJobRunning(status: JobStatus): boolean {
  return status === 'PENDING_UPLOAD' || status === 'PROCESSING';
}

/** The findings ordered by page (a copy: the input is not changed). */
export function sortByPage(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => a.page - b.page);
}

/**
 * The pages with at least one high or medium finding, once each, in order.
 * These are the pages worth opening first (summary of FR-04).
 */
export function relevantPages(findings: readonly Finding[]): number[] {
  const pages = new Set<number>();
  for (const finding of findings) {
    if (finding.relevance === 'high' || finding.relevance === 'medium') {
      pages.add(finding.page);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

/** How many findings each filter option would show. */
export function countByRelevance(
  findings: readonly Finding[],
): Record<RelevanceFilter, number> {
  const counts: Record<RelevanceFilter, number> = {
    all: findings.length,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const finding of findings) {
    counts[finding.relevance] += 1;
  }
  return counts;
}

/** The findings the chosen filter lets through. */
export function filterByRelevance(
  findings: readonly Finding[],
  filter: RelevanceFilter,
): Finding[] {
  if (filter === 'all') {
    return [...findings];
  }
  return findings.filter((finding) => finding.relevance === filter);
}

/** The filter options in the order they are shown: "Todas", then high → low. */
export const RELEVANCE_FILTERS: readonly RelevanceFilter[] = [
  'all',
  ...RELEVANCES,
];

/** "41, 42, 43": a list of page numbers for a sentence. */
export function formatPageList(pages: readonly number[]): string {
  return pages.join(', ');
}
