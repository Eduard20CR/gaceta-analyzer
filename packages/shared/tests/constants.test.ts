import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PAGES_PER_BLOCK,
  MAX_FILE_SIZE_BYTES,
  MIN_PAGES_PER_BLOCK,
  OVERLAP_PAGES,
  PENDING_UPLOAD_EXPIRATION_MS,
  PROCESSING_EXPIRATION_MS,
} from '../src/index';

describe('block size constants', () => {
  it('keeps the minimum block size greater than the overlap', () => {
    // Each new block starts at (previous start + pagesPerBlock - OVERLAP_PAGES).
    // If the block were not bigger than the overlap, block building would never advance (ADR-0012).
    expect(MIN_PAGES_PER_BLOCK).toBeGreaterThan(OVERLAP_PAGES);
  });

  it('uses a default block size that is at least the minimum', () => {
    expect(DEFAULT_PAGES_PER_BLOCK).toBeGreaterThanOrEqual(MIN_PAGES_PER_BLOCK);
  });
});

describe('limits', () => {
  it('allows uploads up to 100 MB', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(104_857_600);
  });

  it('expires pending uploads after 1 hour and processing jobs after 20 minutes', () => {
    expect(PENDING_UPLOAD_EXPIRATION_MS).toBe(3_600_000);
    expect(PROCESSING_EXPIRATION_MS).toBe(1_200_000);
  });
});
