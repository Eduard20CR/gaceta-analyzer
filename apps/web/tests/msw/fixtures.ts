// Sample data used by the default MSW handlers and by tests.
// Typed with @gaceta/shared, so a change in the API contract breaks the tests
// at compile time instead of letting them pass with outdated data.

import type { Finding, Job } from '@gaceta/shared';

export const COMPLETED_JOB: Job = {
  id: '3f6c2a1e-1111-4222-8333-444455556666',
  createdAt: '2026-11-04T20:18:00.000Z',
  updatedAt: '2026-11-04T20:21:00.000Z',
  name: 'Gaceta 4 de noviembre',
  query: 'impuestos, aranceles',
  pagesPerBlock: 5,
  fileName: 'gaceta-2026-11-04.pdf',
  fileSize: 8_388_608,
  pdfKey: 'uploads/3f6c2a1e-1111-4222-8333-444455556666.pdf',
  status: 'COMPLETED',
  pageCount: 120,
  totalBlocks: 30,
  processedBlocks: 30,
  failedPages: [],
  findingsCount: 1,
  relevantPages: [14],
  resultsKey: 'results/3f6c2a1e-1111-4222-8333-444455556666.json',
  startedAt: '2026-11-04T20:18:30.000Z',
  completedAt: '2026-11-04T20:21:00.000Z',
};

export const PENDING_JOB: Job = {
  id: '9a8b7c6d-1111-4222-8333-444455556666',
  createdAt: '2026-11-05T10:00:00.000Z',
  updatedAt: '2026-11-05T10:00:00.000Z',
  name: 'gaceta-2026-11-05.pdf',
  query: 'impuestos',
  pagesPerBlock: 5,
  fileName: 'gaceta-2026-11-05.pdf',
  fileSize: 1_048_576,
  pdfKey: 'uploads/9a8b7c6d-1111-4222-8333-444455556666.pdf',
  status: 'PENDING_UPLOAD',
};

export const FINDINGS: Finding[] = [
  {
    page: 14,
    topic: 'Aranceles',
    quote: 'Se modifica el arancel de importación…',
    reason: 'Cambia un arancel de importación',
    relevance: 'high',
    verification: 'verified',
  },
];

/** Where the fake presigned POST sends the PDF: a fake S3 bucket URL. */
export const FAKE_UPLOAD_URL = 'https://s3.test/gaceta-analyzer-data';

/** A PDF link like the one get-job returns (a presigned GET). */
export const FAKE_PDF_URL = `${FAKE_UPLOAD_URL}/${COMPLETED_JOB.pdfKey}?X-Amz-Signature=abc`;
