import type { Finding, Relevance } from '@gaceta/shared';
import { describe, expect, it } from 'vitest';

import {
  countByRelevance,
  filterByRelevance,
  formatPageList,
  isJobRunning,
  relevantPages,
  sortByPage,
} from '../../src/lib/job-results';

function finding(page: number, relevance: Relevance): Finding {
  return {
    page,
    topic: 'Impuestos',
    quote: `Cita de la página ${page}`,
    reason: 'Habla de impuestos',
    relevance,
    verification: 'verified',
  };
}

const FINDINGS = [
  finding(20, 'low'),
  finding(3, 'high'),
  finding(14, 'medium'),
  finding(3, 'medium'),
];

describe('isJobRunning', () => {
  it('is true only while the job is pending or processing', () => {
    expect(isJobRunning('PENDING_UPLOAD')).toBe(true);
    expect(isJobRunning('PROCESSING')).toBe(true);
    expect(isJobRunning('COMPLETED')).toBe(false);
    expect(isJobRunning('FAILED')).toBe(false);
  });
});

describe('sortByPage', () => {
  it('orders by page without changing the input', () => {
    const sorted = sortByPage(FINDINGS);

    expect(sorted.map((item) => item.page)).toEqual([3, 3, 14, 20]);
    expect(FINDINGS[0]?.page).toBe(20);
  });
});

describe('relevantPages', () => {
  it('lists each page with a high or medium finding once, in order', () => {
    expect(relevantPages(FINDINGS)).toEqual([3, 14]);
  });

  it('is empty when every finding is low', () => {
    expect(relevantPages([finding(5, 'low')])).toEqual([]);
  });
});

describe('countByRelevance', () => {
  it('counts every finding and each relevance', () => {
    expect(countByRelevance(FINDINGS)).toEqual({
      all: 4,
      high: 1,
      medium: 2,
      low: 1,
    });
  });

  it('is all zeros without findings', () => {
    expect(countByRelevance([])).toEqual({
      all: 0,
      high: 0,
      medium: 0,
      low: 0,
    });
  });
});

describe('filterByRelevance', () => {
  it('keeps every finding for "all"', () => {
    expect(filterByRelevance(FINDINGS, 'all')).toEqual(FINDINGS);
  });

  it('keeps only the chosen relevance', () => {
    expect(
      filterByRelevance(FINDINGS, 'medium').map((item) => item.page),
    ).toEqual([14, 3]);
  });
});

describe('formatPageList', () => {
  it('joins the pages with commas', () => {
    expect(formatPageList([41, 42, 43])).toBe('41, 42, 43');
  });
});
