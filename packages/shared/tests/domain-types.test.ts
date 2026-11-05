import { describe, expect, it } from 'vitest';

import { JOB_STATUSES, RELEVANCES, VERIFICATIONS } from '../src/index';
import type { Job, JobResults } from '../src/index';

describe('value lists', () => {
  it('lists every job status', () => {
    expect(JOB_STATUSES).toEqual([
      'PENDING_UPLOAD',
      'PROCESSING',
      'COMPLETED',
      'FAILED',
    ]);
  });

  it('lists every relevance from most to least relevant', () => {
    expect(RELEVANCES).toEqual(['high', 'medium', 'low']);
  });

  it('lists every verification result', () => {
    expect(VERIFICATIONS).toEqual(['verified', 'page_corrected', 'not_found']);
  });
});

describe('types', () => {
  // These objects mostly prove at typecheck time that the types accept the
  // examples from docs/architecture.md → "Data model".
  it('accepts a job that has only just been created', () => {
    const job: Job = {
      id: '3f6c',
      createdAt: '2026-11-04T20:18:00.000Z',
      updatedAt: '2026-11-04T20:18:00.000Z',
      name: 'Gaceta 4 de noviembre',
      query: 'impuestos, aranceles',
      pagesPerBlock: 5,
      fileName: 'gaceta-2026-11-04.pdf',
      fileSize: 8_388_608,
      pdfKey: 'uploads/3f6c.pdf',
      status: 'PENDING_UPLOAD',
    };

    expect(job.pageCount).toBeUndefined();
  });

  it('accepts a results file', () => {
    const results: JobResults = {
      jobId: '3f6c',
      findings: [
        {
          page: 14,
          topic: 'aranceles',
          quote: 'texto literal del documento',
          reason: 'por qué es relevante',
          relevance: 'high',
          verification: 'verified',
        },
      ],
    };

    expect(results.findings).toHaveLength(1);
  });
});
