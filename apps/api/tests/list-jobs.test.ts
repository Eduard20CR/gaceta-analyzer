import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ErrorResponse, Job, ListJobsResponse } from '@gaceta/shared';

import { handler } from '../src/handlers/list-jobs';
import { InvalidCursorError, listJobs } from '../src/lib/jobs-repository';
import type * as JobsRepositoryModule from '../src/lib/jobs-repository';

// The handler is tested on its own: DynamoDB is replaced by a fake.
// `applyExpiration` is the real one, so the expiration rules are exercised too.
vi.mock('../src/lib/jobs-repository', async (importOriginal) => {
  const original = await importOriginal<typeof JobsRepositoryModule>();
  // `InvalidCursorError` stays real so `instanceof` works in the handler.
  return { InvalidCursorError: original.InvalidCursorError, listJobs: vi.fn() };
});

/** An ISO date `minutes` minutes before now. */
function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function makeJob(id: string, overrides: Partial<Job> = {}): Job {
  return {
    id,
    createdAt: minutesAgo(10),
    updatedAt: minutesAgo(5),
    name: `Gaceta ${id}`,
    query: 'impuestos, aranceles',
    pagesPerBlock: 5,
    fileName: 'gaceta.pdf',
    fileSize: 1234,
    pdfKey: `uploads/${id}.pdf`,
    status: 'COMPLETED',
    findingsCount: 3,
    resultsKey: `results/${id}.json`,
    ...overrides,
  };
}

function eventFor(
  routeKey: string,
  query?: Record<string, string>,
): APIGatewayProxyEventV2 {
  const event = { routeKey, queryStringParameters: query };
  // The full event has many request-context fields the handler never reads.
  return event as unknown as APIGatewayProxyEventV2;
}

function parseBody<Body>(body: string | undefined): Body {
  return JSON.parse(body ?? '') as Body;
}

beforeEach(() => {
  vi.mocked(listJobs).mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('list-jobs handler: GET /api/auth/check', () => {
  it('returns 204 with an empty body', async () => {
    const response = await handler(eventFor('GET /api/auth/check'));

    expect(response.statusCode).toBe(204);
    expect(response.body).toBeUndefined();
    expect(listJobs).not.toHaveBeenCalled();
  });
});

describe('list-jobs handler: GET /api/jobs', () => {
  it('returns the jobs in the repository order and passes nextCursor through', async () => {
    vi.mocked(listJobs).mockResolvedValue({
      jobs: [makeJob('b'), makeJob('a')],
      nextCursor: 'next-page',
    });

    const response = await handler(eventFor('GET /api/jobs'));

    expect(response.statusCode).toBe(200);
    const body = parseBody<ListJobsResponse>(response.body);
    expect(body.jobs.map((job) => job.id)).toEqual(['b', 'a']);
    expect(body.nextCursor).toBe('next-page');
    expect(listJobs).toHaveBeenCalledWith(undefined);
  });

  it('passes the cursor to the repository', async () => {
    vi.mocked(listJobs).mockResolvedValue({ jobs: [], nextCursor: null });

    const response = await handler(
      eventFor('GET /api/jobs', { cursor: 'abc' }),
    );

    expect(listJobs).toHaveBeenCalledWith('abc');
    expect(parseBody<ListJobsResponse>(response.body)).toEqual({
      jobs: [],
      nextCursor: null,
    });
  });

  it('treats an empty cursor as the first page', async () => {
    vi.mocked(listJobs).mockResolvedValue({ jobs: [], nextCursor: null });

    await handler(eventFor('GET /api/jobs', { cursor: '' }));

    expect(listJobs).toHaveBeenCalledWith(undefined);
  });

  it('returns only the JobSummary fields', async () => {
    vi.mocked(listJobs).mockResolvedValue({
      jobs: [makeJob('a')],
      nextCursor: null,
    });

    const response = await handler(eventFor('GET /api/jobs'));

    const [summary] = parseBody<ListJobsResponse>(response.body).jobs;
    expect(Object.keys(summary ?? {}).sort()).toEqual([
      'createdAt',
      'findingsCount',
      'id',
      'name',
      'status',
    ]);
    expect(summary).toEqual({
      id: 'a',
      name: 'Gaceta a',
      status: 'COMPLETED',
      createdAt: makeJob('a').createdAt,
      findingsCount: 3,
    });
  });

  it('shows expired jobs as FAILED', async () => {
    vi.mocked(listJobs).mockResolvedValue({
      jobs: [
        makeJob('stuck', {
          status: 'PROCESSING',
          startedAt: minutesAgo(21),
        }),
        makeJob('never-uploaded', {
          status: 'PENDING_UPLOAD',
          createdAt: minutesAgo(61),
        }),
        makeJob('running', {
          status: 'PROCESSING',
          startedAt: minutesAgo(2),
        }),
      ],
      nextCursor: null,
    });

    const response = await handler(eventFor('GET /api/jobs'));

    const statuses = parseBody<ListJobsResponse>(response.body).jobs.map(
      (job) => job.status,
    );
    expect(statuses).toEqual(['FAILED', 'FAILED', 'PROCESSING']);
  });

  it('returns 400 with a Spanish message for an invalid cursor', async () => {
    vi.mocked(listJobs).mockRejectedValue(new InvalidCursorError());

    const response = await handler(
      eventFor('GET /api/jobs', { cursor: 'tampered' }),
    );

    expect(response.statusCode).toBe(400);
    expect(parseBody<ErrorResponse>(response.body).error).toBe(
      'La página solicitada no es válida. Vuelva al inicio.',
    );
  });

  it('returns 500 with a generic Spanish message when DynamoDB fails', async () => {
    vi.mocked(listJobs).mockRejectedValue(new Error('DynamoDB is down'));

    const response = await handler(eventFor('GET /api/jobs'));

    expect(response.statusCode).toBe(500);
    expect(parseBody<ErrorResponse>(response.body).error).toBe(
      'Ocurrió un error inesperado. Intente de nuevo más tarde.',
    );
  });
});

describe('list-jobs handler: other routes', () => {
  it('returns 404 for an unknown route key', async () => {
    const response = await handler(eventFor('DELETE /api/jobs'));

    expect(response.statusCode).toBe(404);
    expect(parseBody<ErrorResponse>(response.body).error).toBeTypeOf('string');
  });
});
