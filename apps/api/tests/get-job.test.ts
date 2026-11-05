import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ErrorResponse,
  Finding,
  GetJobResponse,
  Job,
} from '@gaceta/shared';

import { handler } from '../src/handlers/get-job';
import { getJob } from '../src/lib/jobs-repository';
import { createPdfReadUrl, getResults } from '../src/lib/storage';

// The handler is tested on its own: DynamoDB and S3 are replaced by fakes.
// `applyExpiration` is the real one, so the expiration rules are exercised too.
vi.mock('../src/lib/jobs-repository', () => ({ getJob: vi.fn() }));
vi.mock('../src/lib/storage', () => ({
  createPdfReadUrl: vi.fn(),
  getResults: vi.fn(),
}));

const ID = '3f6c2a1e-1111-4222-8333-444455556666';
const PDF_URL = 'https://gaceta-analyzer-data-123.s3.amazonaws.com/signed';

const FINDINGS: Finding[] = [
  {
    page: 4,
    topic: 'impuestos',
    quote: 'Se reforma el impuesto sobre la renta',
    reason: 'Cambia un impuesto.',
    relevance: 'high',
    verification: 'verified',
  },
];

/** An ISO date `minutes` minutes before now. */
function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function makeJob(overrides: Partial<Job>): Job {
  return {
    id: ID,
    createdAt: minutesAgo(5),
    updatedAt: minutesAgo(1),
    name: 'Gaceta 4 nov',
    query: 'impuestos, aranceles',
    pagesPerBlock: 5,
    fileName: 'gaceta.pdf',
    fileSize: 1234,
    pdfKey: `uploads/${ID}.pdf`,
    status: 'PROCESSING',
    startedAt: minutesAgo(2),
    ...overrides,
  };
}

const COMPLETED_JOB = makeJob({
  status: 'COMPLETED',
  findingsCount: 1,
  relevantPages: [4],
  resultsKey: `results/${ID}.json`,
  failedPages: [],
  completedAt: minutesAgo(1),
});

/** A minimal HTTP API event: the handler only reads the path parameters. */
function eventForId(id: string | undefined): APIGatewayProxyEventV2 {
  const event = {
    routeKey: 'GET /api/jobs/{id}',
    pathParameters: id === undefined ? undefined : { id },
  };
  // The full event has many request-context fields the handler never reads.
  return event as unknown as APIGatewayProxyEventV2;
}

function parseBody<Body>(body: string | undefined): Body {
  return JSON.parse(body ?? '') as Body;
}

beforeEach(() => {
  vi.mocked(getJob).mockReset();
  vi.mocked(getResults)
    .mockReset()
    .mockResolvedValue({ jobId: ID, findings: FINDINGS });
  vi.mocked(createPdfReadUrl).mockReset().mockResolvedValue(PDF_URL);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('get-job handler', () => {
  it('returns a completed job with its findings and the PDF url', async () => {
    vi.mocked(getJob).mockResolvedValue(COMPLETED_JOB);

    const response = await handler(eventForId(ID));

    expect(response.statusCode).toBe(200);
    expect(parseBody<GetJobResponse>(response.body)).toEqual({
      job: COMPLETED_JOB,
      findings: FINDINGS,
      pdfUrl: PDF_URL,
    });
    expect(getJob).toHaveBeenCalledWith(ID);
    expect(getResults).toHaveBeenCalledWith(`results/${ID}.json`);
    expect(createPdfReadUrl).toHaveBeenCalledWith(`uploads/${ID}.pdf`);
  });

  it('returns a processing job without findings', async () => {
    const job = makeJob({ status: 'PROCESSING' });
    vi.mocked(getJob).mockResolvedValue(job);

    const response = await handler(eventForId(ID));

    expect(response.statusCode).toBe(200);
    const body = parseBody<GetJobResponse>(response.body);
    expect(body).toEqual({ job, pdfUrl: PDF_URL });
    expect('findings' in body).toBe(false);
    expect(getResults).not.toHaveBeenCalled();
  });

  it('returns a job processing for 21 minutes as FAILED', async () => {
    vi.mocked(getJob).mockResolvedValue(
      makeJob({ status: 'PROCESSING', startedAt: minutesAgo(21) }),
    );

    const response = await handler(eventForId(ID));

    expect(response.statusCode).toBe(200);
    const body = parseBody<GetJobResponse>(response.body);
    expect(body.job.status).toBe('FAILED');
    expect(body.job.errorMessage).toBe('El análisis tardó demasiado');
    expect(body.findings).toBeUndefined();
  });

  it('returns pdfUrl null and still the findings when the PDF was deleted', async () => {
    vi.mocked(getJob).mockResolvedValue(COMPLETED_JOB);
    vi.mocked(createPdfReadUrl).mockResolvedValue(null);

    const response = await handler(eventForId(ID));

    const body = parseBody<GetJobResponse>(response.body);
    expect(body.pdfUrl).toBeNull();
    expect(body.findings).toEqual(FINDINGS);
  });

  it('returns 404 with a Spanish message for an unknown id', async () => {
    vi.mocked(getJob).mockResolvedValue(null);

    const response = await handler(eventForId(ID));

    expect(response.statusCode).toBe(404);
    expect(parseBody<ErrorResponse>(response.body)).toEqual({
      error: 'El análisis no existe',
    });
  });

  it.each([
    ['a missing id', undefined],
    ['an id that is not a UUID', 'not-a-uuid'],
  ])('returns 404 without reading DynamoDB for %s', async (_case, id) => {
    const response = await handler(eventForId(id));

    expect(response.statusCode).toBe(404);
    expect(getJob).not.toHaveBeenCalled();
  });

  it('returns 500 with a generic Spanish message when S3 fails', async () => {
    vi.mocked(getJob).mockResolvedValue(COMPLETED_JOB);
    vi.mocked(getResults).mockRejectedValue(new Error('S3 is down'));

    const response = await handler(eventForId(ID));

    expect(response.statusCode).toBe(500);
    expect(parseBody<ErrorResponse>(response.body).error).toBe(
      'Ocurrió un error inesperado. Intente de nuevo más tarde.',
    );
    const logged = String(vi.mocked(console.error).mock.calls[0]?.[0]);
    expect(JSON.parse(logged)).toMatchObject({ jobId: ID });
  });
});
