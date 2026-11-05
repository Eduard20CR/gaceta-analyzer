// Default fake responses for every request the web app makes (ADR-0013).
//
// They describe the "happy path". A test that needs an error overrides one of
// them for that test only:
//
//   server.use(
//     http.get('/api/jobs', () =>
//       HttpResponse.json({ error: 'Algo falló' }, { status: 500 }),
//     ),
//   );
//
// `server.resetHandlers()` (tests/setup.ts) removes the override after each test.

import { HttpResponse, http } from 'msw';

import type {
  CreateJobRequestInput,
  CreateJobResponse,
  GetJobResponse,
  ListJobsResponse,
} from '@gaceta/shared';

import {
  COMPLETED_JOB,
  FAKE_PDF_URL,
  FAKE_UPLOAD_URL,
  FINDINGS,
  PENDING_JOB,
} from './fixtures';

/**
 * A response from the fake S3 bucket.
 *
 * The upload goes to another origin (the bucket, not the app), so jsdom applies
 * the browser's CORS rules like a real browser would: it first sends an OPTIONS
 * "preflight" request and then only accepts responses that carry CORS headers.
 * The real bucket gets the same rules from Terraform (#32).
 */
export function s3Response(status: number): HttpResponse<null> {
  return new HttpResponse(null, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

export const handlers = [
  // The password is right (FR-01).
  http.get('/api/auth/check', () => new HttpResponse(null, { status: 204 })),

  // One page of history with no more pages (FR-05).
  http.get('/api/jobs', () => {
    const body: ListJobsResponse = {
      jobs: [
        {
          id: COMPLETED_JOB.id,
          name: COMPLETED_JOB.name,
          status: COMPLETED_JOB.status,
          createdAt: COMPLETED_JOB.createdAt,
          findingsCount: 1,
        },
      ],
      nextCursor: null,
    };
    return HttpResponse.json(body);
  }),

  // Any id returns the completed job with its findings (FR-04).
  http.get('/api/jobs/:id', ({ params }) => {
    const body: GetJobResponse = {
      job: { ...COMPLETED_JOB, id: String(params['id']) },
      findings: FINDINGS,
      pdfUrl: FAKE_PDF_URL,
    };
    return HttpResponse.json(body);
  }),

  // The job is created and a presigned POST is returned (FR-02).
  http.post('/api/jobs', async ({ request }) => {
    const input = (await request.json()) as CreateJobRequestInput;
    const body: CreateJobResponse = {
      job: {
        ...PENDING_JOB,
        name: input.name ?? input.fileName,
        query: input.query,
        fileName: input.fileName,
        fileSize: input.fileSize,
        pagesPerBlock: input.pagesPerBlock ?? PENDING_JOB.pagesPerBlock,
      },
      upload: {
        url: FAKE_UPLOAD_URL,
        fields: { key: PENDING_JOB.pdfKey, 'Content-Type': 'application/pdf' },
      },
    };
    return HttpResponse.json(body, { status: 201 });
  }),

  // The browser's CORS preflight before the upload.
  http.options(FAKE_UPLOAD_URL, () => s3Response(204)),

  // S3 answers 204 when the presigned POST upload works.
  http.post(FAKE_UPLOAD_URL, () => s3Response(204)),
];
