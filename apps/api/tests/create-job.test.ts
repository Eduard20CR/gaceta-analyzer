import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateJobResponse, ErrorResponse, Job } from '@gaceta/shared';

import { handler } from '../src/handlers/create-job';
import { createJob } from '../src/lib/jobs-repository';
import type { NewJob } from '../src/lib/jobs-repository';
import { createUploadPost } from '../src/lib/storage';
import type * as StorageModule from '../src/lib/storage';

// The handler is tested on its own: the repository and storage have their own
// tests, so here they are replaced by fakes that record what they receive.
vi.mock('../src/lib/jobs-repository', () => ({
  createJob: vi.fn(),
}));
vi.mock('../src/lib/storage', async (importOriginal) => {
  const original = await importOriginal<typeof StorageModule>();
  // `uploadKey` stays real: it is a pure function and the key format matters.
  return { ...original, createUploadPost: vi.fn() };
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const UPLOAD = {
  url: 'https://gaceta-analyzer-data-123.s3.amazonaws.com/',
  fields: { key: 'uploads/x.pdf', 'Content-Type': 'application/pdf' },
};

const VALID_BODY = {
  name: 'Gaceta 4 nov',
  query: 'impuestos, aranceles',
  fileName: 'gaceta.pdf',
  fileSize: 8388608,
  pagesPerBlock: 5,
};

/** A minimal HTTP API event: the handler only reads the body. */
function eventWithBody(body: string | undefined): APIGatewayProxyEventV2 {
  const event = { routeKey: 'POST /api/jobs', body, isBase64Encoded: false };
  // The full event has many request-context fields the handler never reads.
  return event as unknown as APIGatewayProxyEventV2;
}

function eventWithJson(body: unknown): APIGatewayProxyEventV2 {
  return eventWithBody(JSON.stringify(body));
}

/** The job the handler passed to `createJob`. */
function storedJob(): NewJob {
  const call = vi.mocked(createJob).mock.calls[0];
  if (call === undefined) {
    throw new Error('createJob was not called');
  }
  return call[0];
}

beforeEach(() => {
  vi.mocked(createJob).mockReset();
  vi.mocked(createUploadPost).mockReset();
  // The fake repository behaves like the real one: it adds the timestamps.
  vi.mocked(createJob).mockImplementation((newJob) => {
    const job: Job = {
      ...newJob,
      createdAt: '2026-11-05T20:00:00.000Z',
      updatedAt: '2026-11-05T20:00:00.000Z',
    };
    return Promise.resolve(job);
  });
  vi.mocked(createUploadPost).mockResolvedValue(UPLOAD);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('create-job handler', () => {
  it('stores a PENDING_UPLOAD job and returns 201 with the job and the upload', async () => {
    const response = await handler(eventWithJson(VALID_BODY));

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body ?? '') as CreateJobResponse;

    const job = storedJob();
    expect(job.id).toMatch(UUID_PATTERN);
    expect(job).toEqual({
      id: job.id,
      name: 'Gaceta 4 nov',
      query: 'impuestos, aranceles',
      fileName: 'gaceta.pdf',
      fileSize: 8388608,
      pagesPerBlock: 5,
      pdfKey: `uploads/${job.id}.pdf`,
      status: 'PENDING_UPLOAD',
    });

    expect(createUploadPost).toHaveBeenCalledWith(job.id);
    expect(body.upload).toEqual(UPLOAD);
    expect(body.job).toEqual({
      ...job,
      createdAt: '2026-11-05T20:00:00.000Z',
      updatedAt: '2026-11-05T20:00:00.000Z',
    });
  });

  it('generates a different id for each job', async () => {
    await handler(eventWithJson(VALID_BODY));
    await handler(eventWithJson(VALID_BODY));

    const calls = vi.mocked(createJob).mock.calls;
    expect(calls[0]?.[0].id).not.toBe(calls[1]?.[0].id);
  });

  it('uses the file name when the name is missing', async () => {
    const { name: _name, ...withoutName } = VALID_BODY;

    await handler(eventWithJson(withoutName));

    expect(storedJob().name).toBe('gaceta.pdf');
  });

  it('uses the file name when the name is only spaces', async () => {
    await handler(eventWithJson({ ...VALID_BODY, name: '   ' }));

    expect(storedJob().name).toBe('gaceta.pdf');
  });

  it('stores 5 pages per block when pagesPerBlock is missing', async () => {
    const { pagesPerBlock: _pagesPerBlock, ...withoutPagesPerBlock } =
      VALID_BODY;

    await handler(eventWithJson(withoutPagesPerBlock));

    expect(storedJob().pagesPerBlock).toBe(5);
  });

  it.each([
    ['invalid JSON', eventWithBody('{ not json')],
    ['an empty body', eventWithBody(undefined)],
    ['pagesPerBlock 1', eventWithJson({ ...VALID_BODY, pagesPerBlock: 1 })],
    ['a 2-character query', eventWithJson({ ...VALID_BODY, query: 'ab' })],
    [
      'a file over 100 MB',
      eventWithJson({ ...VALID_BODY, fileSize: 100 * 1024 * 1024 + 1 }),
    ],
    [
      'a file that is not a PDF',
      eventWithJson({ ...VALID_BODY, fileName: 'gaceta.docx' }),
    ],
  ])('returns 400 with a Spanish message for %s', async (_case, event) => {
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body ?? '') as ErrorResponse;
    expect(body.error).toBeTypeOf('string');
    expect(body.error.length).toBeGreaterThan(0);
    expect(createJob).not.toHaveBeenCalled();
    expect(createUploadPost).not.toHaveBeenCalled();
  });

  it('returns the message of the rule that failed', async () => {
    const response = await handler(
      eventWithJson({ ...VALID_BODY, pagesPerBlock: 1 }),
    );

    const body = JSON.parse(response.body ?? '') as ErrorResponse;
    expect(body.error).toBe('Las páginas por bloque deben ser al menos 2');
  });

  it('returns 500 with a generic Spanish message and logs the jobId when DynamoDB fails', async () => {
    vi.mocked(createJob).mockRejectedValue(new Error('DynamoDB is down'));

    const response = await handler(eventWithJson(VALID_BODY));

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body ?? '') as ErrorResponse;
    expect(body.error).toBe(
      'Ocurrió un error inesperado. Intente de nuevo más tarde.',
    );

    const errorLines = vi
      .mocked(console.error)
      .mock.calls.map((args) => String(args[0]));
    expect(errorLines).toHaveLength(1);
    const logged = JSON.parse(errorLines[0] ?? '') as Record<string, unknown>;
    expect(logged['jobId']).toBe(storedJob().id);
    expect(errorLines[0]).toContain('DynamoDB is down');
  });

  it('never logs the query', async () => {
    await handler(eventWithJson(VALID_BODY));

    const lines = [
      ...vi.mocked(console.log).mock.calls,
      ...vi.mocked(console.error).mock.calls,
    ].map((args) => args.join(' '));
    expect(lines.join('\n')).not.toContain('impuestos');
  });
});
