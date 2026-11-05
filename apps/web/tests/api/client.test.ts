import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { setPassword } from '../../src/api/auth-storage';
import { checkAuth, createJob, getJob, listJobs } from '../../src/api/client';
import {
  API_ERROR_MESSAGES,
  ApiError,
  UnauthorizedError,
} from '../../src/api/errors';
import { uploadPdf } from '../../src/api/upload';
import { COMPLETED_JOB, FAKE_UPLOAD_URL } from '../msw/fixtures';
import { s3Response } from '../msw/handlers';
import { server } from '../msw/server';

/** Replaces GET /api/jobs with one that remembers the Authorization header it got. */
function recordAuthorizationHeader(): { value: string | null | undefined } {
  const received: { value: string | null | undefined } = { value: undefined };
  server.use(
    http.get('/api/jobs', ({ request }) => {
      received.value = request.headers.get('Authorization');
      return HttpResponse.json({ jobs: [], nextCursor: null });
    }),
  );
  return received;
}

describe('API client', () => {
  it('returns the typed response body', async () => {
    const response = await getJob(COMPLETED_JOB.id);

    expect(response.job.id).toBe(COMPLETED_JOB.id);
    expect(response.findings).toHaveLength(1);
  });

  it('sends the stored password as a Bearer token', async () => {
    setPassword('la-clave');
    const received = recordAuthorizationHeader();

    await listJobs();

    expect(received.value).toBe('Bearer la-clave');
  });

  it('sends no Authorization header when no password is stored', async () => {
    const received = recordAuthorizationHeader();

    await listJobs();

    expect(received.value).toBeNull();
  });

  it('checkAuth sends the password it is given instead of the stored one', async () => {
    setPassword('vieja');
    let received: string | null = null;
    server.use(
      http.get('/api/auth/check', ({ request }) => {
        received = request.headers.get('Authorization');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await checkAuth('nueva');

    expect(received).toBe('Bearer nueva');
  });

  it('passes the cursor in the query string', async () => {
    let cursor: string | null = null;
    server.use(
      http.get('/api/jobs', ({ request }) => {
        cursor = new URL(request.url).searchParams.get('cursor');
        return HttpResponse.json({ jobs: [], nextCursor: null });
      }),
    );

    await listJobs('abc+/=');

    expect(cursor).toBe('abc+/=');
  });

  it('sends the new job as JSON', async () => {
    const response = await createJob({
      query: 'impuestos',
      fileName: 'gaceta.pdf',
      fileSize: 1000,
    });

    expect(response.job.query).toBe('impuestos');
    expect(response.upload.url).toBe(FAKE_UPLOAD_URL);
  });

  it.each([401, 403])('turns %i into UnauthorizedError', async (status) => {
    server.use(http.get('/api/jobs', () => new HttpResponse(null, { status })));

    await expect(listJobs()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('turns another error into ApiError with the Spanish message of the API', async () => {
    server.use(
      http.get('/api/jobs/:id', () =>
        HttpResponse.json({ error: 'El análisis no existe' }, { status: 404 }),
      ),
    );

    const error: unknown = await getJob('nope').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 404,
      message: 'El análisis no existe',
    });
  });

  it('uses a generic Spanish message when the error body is not JSON', async () => {
    server.use(
      http.get('/api/jobs', () => new HttpResponse('<html>', { status: 502 })),
    );

    await expect(listJobs()).rejects.toMatchObject({
      status: 502,
      message: API_ERROR_MESSAGES.unexpected,
    });
  });

  it('turns a network failure into ApiError with status 0', async () => {
    server.use(http.get('/api/jobs', () => HttpResponse.error()));

    await expect(listJobs()).rejects.toMatchObject({
      status: 0,
      message: API_ERROR_MESSAGES.network,
    });
  });
});

describe('uploadPdf', () => {
  const UPLOAD = {
    url: FAKE_UPLOAD_URL,
    fields: { key: 'uploads/abc.pdf', 'Content-Type': 'application/pdf' },
  };

  function pdfFile(): File {
    return new File(['%PDF-1.7 contenido'], 'gaceta.pdf', {
      type: 'application/pdf',
    });
  }

  it('sends the fields and the file to S3 without the Authorization header', async () => {
    setPassword('la-clave');
    let authorization: string | null = 'not checked';
    let fieldNames: string[] = [];
    server.use(
      http.post(FAKE_UPLOAD_URL, async ({ request }) => {
        authorization = request.headers.get('Authorization');
        // The multipart body is read as text: Node's `formData()` parser does
        // not accept the File objects that jsdom's XMLHttpRequest sends.
        const body = await request.text();
        fieldNames = [...body.matchAll(/form-data; name="([^"]+)"/g)].map(
          (match) => match[1] ?? '',
        );
        return s3Response(204);
      }),
    );

    await uploadPdf(UPLOAD, pdfFile());

    // The password must never be sent to S3.
    expect(authorization).toBeNull();
    // The fields first and the file last, as S3 requires.
    expect(fieldNames).toEqual(['key', 'Content-Type', 'file']);
  });

  it('reports progress and ends at 1', async () => {
    const fractions: number[] = [];

    await uploadPdf(UPLOAD, pdfFile(), (fraction) => fractions.push(fraction));

    expect(fractions.length).toBeGreaterThan(0);
    expect(fractions.at(-1)).toBe(1);
  });

  it('rejects with the Spanish upload message when S3 refuses the file', async () => {
    server.use(http.post(FAKE_UPLOAD_URL, () => s3Response(403)));

    await expect(uploadPdf(UPLOAD, pdfFile())).rejects.toMatchObject({
      status: 403,
      message: API_ERROR_MESSAGES.upload,
    });
  });
});
