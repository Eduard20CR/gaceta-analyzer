import { describe, expect, it } from 'vitest';

import type { Job } from '@gaceta/shared';

import {
  EXPIRATION_MESSAGES,
  applyExpiration,
} from '../src/lib/job-expiration';

// Every test uses this fixed "now", so results never depend on the clock.
const NOW = new Date('2026-11-05T12:00:00.000Z');

/** An ISO date `minutes` minutes before NOW. */
function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();
}

function buildJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    createdAt: minutesAgo(0),
    updatedAt: minutesAgo(0),
    name: 'Gaceta 4 nov',
    query: 'impuestos, aranceles',
    pagesPerBlock: 5,
    fileName: 'gaceta.pdf',
    fileSize: 8_388_608,
    pdfKey: 'uploads/job-1.pdf',
    status: 'PENDING_UPLOAD',
    ...overrides,
  };
}

describe('applyExpiration — PENDING_UPLOAD', () => {
  it('leaves a job created 59 minutes ago unchanged', () => {
    const job = buildJob({ createdAt: minutesAgo(59) });

    expect(applyExpiration(job, NOW)).toEqual(job);
  });

  it('reports a job created 61 minutes ago as FAILED', () => {
    const job = buildJob({ createdAt: minutesAgo(61) });

    const result = applyExpiration(job, NOW);

    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toBe('El PDF nunca se subió');
    expect(result.errorMessage).toBe(EXPIRATION_MESSAGES.uploadNeverHappened);
  });
});

describe('applyExpiration — PROCESSING', () => {
  it('leaves a job started 19 minutes ago unchanged', () => {
    const job = buildJob({
      status: 'PROCESSING',
      createdAt: minutesAgo(30),
      startedAt: minutesAgo(19),
    });

    expect(applyExpiration(job, NOW)).toEqual(job);
  });

  it('reports a job started 21 minutes ago as FAILED', () => {
    const job = buildJob({
      status: 'PROCESSING',
      createdAt: minutesAgo(30),
      startedAt: minutesAgo(21),
    });

    const result = applyExpiration(job, NOW);

    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toBe('El análisis tardó demasiado');
  });

  it('measures from startedAt, not createdAt', () => {
    // Created long ago (the upload was slow), but the analysis only just started.
    const job = buildJob({
      status: 'PROCESSING',
      createdAt: minutesAgo(50),
      startedAt: minutesAgo(5),
    });

    expect(applyExpiration(job, NOW).status).toBe('PROCESSING');
  });

  it('falls back to updatedAt when startedAt is missing', () => {
    const recent = buildJob({
      status: 'PROCESSING',
      updatedAt: minutesAgo(19),
    });
    const old = buildJob({ status: 'PROCESSING', updatedAt: minutesAgo(21) });

    expect(applyExpiration(recent, NOW).status).toBe('PROCESSING');
    expect(applyExpiration(old, NOW).status).toBe('FAILED');
  });
});

describe('applyExpiration — final states', () => {
  it.each(['COMPLETED', 'FAILED'] as const)(
    'never changes a %s job, however old',
    (status) => {
      const job = buildJob({
        status,
        createdAt: minutesAgo(10_000),
        updatedAt: minutesAgo(10_000),
        startedAt: minutesAgo(10_000),
      });

      expect(applyExpiration(job, NOW)).toEqual(job);
    },
  );

  it('keeps the original message of a job that already FAILED', () => {
    const job = buildJob({
      status: 'FAILED',
      createdAt: minutesAgo(120),
      errorMessage: 'El PDF no tiene texto',
    });

    expect(applyExpiration(job, NOW).errorMessage).toBe(
      'El PDF no tiene texto',
    );
  });
});

describe('applyExpiration — immutability', () => {
  it('does not mutate the input job', () => {
    const job = buildJob({ createdAt: minutesAgo(61) });
    const copyBefore = structuredClone(job);

    const result = applyExpiration(job, NOW);

    expect(job).toEqual(copyBefore);
    expect(result).not.toBe(job);
  });

  it('keeps every other field of an expired job', () => {
    const job = buildJob({ createdAt: minutesAgo(61) });

    const result = applyExpiration(job, NOW);

    expect(result).toEqual({
      ...job,
      status: 'FAILED',
      errorMessage: EXPIRATION_MESSAGES.uploadNeverHappened,
    });
  });
});

describe('applyExpiration — default now', () => {
  it('uses the current time when now is not given', () => {
    const job = buildJob({ createdAt: new Date().toISOString() });

    expect(applyExpiration(job).status).toBe('PENDING_UPLOAD');
  });
});
