import { describe, expect, it } from 'vitest';

import { MAX_FILE_SIZE_BYTES, createJobRequestSchema } from '../src/index';
import type {
  CreateJobRequestInput,
  ErrorResponse,
  GetJobResponse,
  Job,
  ListJobsResponse,
} from '../src/index';

// A request that passes every rule. Each test changes one field.
const validRequest: CreateJobRequestInput = {
  name: 'Gaceta 4 nov',
  query: 'impuestos, aranceles',
  fileName: 'gaceta.pdf',
  fileSize: 8388608,
  pagesPerBlock: 5,
};

/** Returns the first validation message, which is what the user would see. */
function firstErrorMessage(request: unknown): string | undefined {
  const result = createJobRequestSchema.safeParse(request);
  if (result.success) {
    return undefined;
  }
  return result.error.issues[0]?.message;
}

describe('createJobRequestSchema', () => {
  it('accepts a valid request', () => {
    const result = createJobRequestSchema.safeParse(validRequest);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(validRequest);
  });

  it('uses 5 pages per block when pagesPerBlock is missing', () => {
    const { pagesPerBlock: _omitted, ...request } = validRequest;

    const parsed = createJobRequestSchema.parse(request);

    expect(parsed.pagesPerBlock).toBe(5);
  });

  it('accepts a request without a name', () => {
    const { name: _omitted, ...request } = validRequest;

    const parsed = createJobRequestSchema.parse(request);

    expect(parsed.name).toBeUndefined();
  });

  it('trims the name and the query', () => {
    const parsed = createJobRequestSchema.parse({
      ...validRequest,
      name: '  Gaceta  ',
      query: '  impuestos  ',
    });

    expect(parsed.name).toBe('Gaceta');
    expect(parsed.query).toBe('impuestos');
  });

  it.each([1, 2.5, 0, -3])('rejects %s pages per block', (pagesPerBlock) => {
    const message = firstErrorMessage({ ...validRequest, pagesPerBlock });

    expect(message).toMatch(/páginas por bloque/i);
  });

  it('accepts 2 pages per block, the minimum, and has no maximum', () => {
    expect(
      createJobRequestSchema.safeParse({ ...validRequest, pagesPerBlock: 2 })
        .success,
    ).toBe(true);
    expect(
      createJobRequestSchema.safeParse({ ...validRequest, pagesPerBlock: 500 })
        .success,
    ).toBe(true);
  });

  it('rejects a query of 2 characters', () => {
    const message = firstErrorMessage({ ...validRequest, query: 'ab' });

    expect(message).toBe('La búsqueda debe tener al menos 3 caracteres');
  });

  it('checks the query length after trimming', () => {
    const message = firstErrorMessage({ ...validRequest, query: '   ab   ' });

    expect(message).toBe('La búsqueda debe tener al menos 3 caracteres');
  });

  it('accepts a query of 3 and of 2,000 characters', () => {
    for (const query of ['abc', 'a'.repeat(2000)]) {
      expect(
        createJobRequestSchema.safeParse({ ...validRequest, query }).success,
      ).toBe(true);
    }
  });

  it('rejects a query of 2,001 characters', () => {
    const message = firstErrorMessage({
      ...validRequest,
      query: 'a'.repeat(2001),
    });

    expect(message).toBe('La búsqueda puede tener como máximo 2000 caracteres');
  });

  it('rejects a missing query with a Spanish message', () => {
    const { query: _omitted, ...request } = validRequest;

    expect(firstErrorMessage(request)).toBe('Escriba qué desea buscar');
  });

  it('accepts a name of 120 characters and rejects one of 121', () => {
    expect(
      createJobRequestSchema.safeParse({
        ...validRequest,
        name: 'a'.repeat(120),
      }).success,
    ).toBe(true);

    const message = firstErrorMessage({
      ...validRequest,
      name: 'a'.repeat(121),
    });
    expect(message).toBe('El nombre puede tener como máximo 120 caracteres');
  });

  it('accepts a file of exactly 100 MB and rejects a larger one', () => {
    expect(
      createJobRequestSchema.safeParse({
        ...validRequest,
        fileSize: MAX_FILE_SIZE_BYTES,
      }).success,
    ).toBe(true);

    const message = firstErrorMessage({
      ...validRequest,
      fileSize: MAX_FILE_SIZE_BYTES + 1,
    });
    expect(message).toBe('El archivo puede pesar como máximo 100 MB');
  });

  it('rejects an empty file', () => {
    expect(firstErrorMessage({ ...validRequest, fileSize: 0 })).toBe(
      'El archivo está vacío',
    );
  });

  it.each(['gaceta.docx', 'gaceta', 'gaceta.pdf.exe', ''])(
    'rejects the file name "%s"',
    (fileName) => {
      const message = firstErrorMessage({ ...validRequest, fileName });

      expect(message).toMatch(/archivo/i);
    },
  );

  it('accepts a PDF file name in upper case', () => {
    expect(
      createJobRequestSchema.safeParse({
        ...validRequest,
        fileName: 'GACETA.PDF',
      }).success,
    ).toBe(true);
  });
});

describe('response types', () => {
  // These objects mostly prove at typecheck time that the types accept the
  // examples from docs/architecture.md → "API contract".
  const job: Job = {
    id: '3f6c',
    createdAt: '2026-11-04T20:18:00.000Z',
    updatedAt: '2026-11-04T20:18:00.000Z',
    name: 'Gaceta 4 nov',
    query: 'impuestos, aranceles',
    pagesPerBlock: 5,
    fileName: 'gaceta.pdf',
    fileSize: 8388608,
    pdfKey: 'uploads/3f6c.pdf',
    status: 'COMPLETED',
  };

  it('allows a get-job response without findings and without a PDF URL', () => {
    const response: GetJobResponse = { job, pdfUrl: null };

    expect(response.findings).toBeUndefined();
  });

  it('allows a job list with a cursor for the next page', () => {
    const response: ListJobsResponse = {
      jobs: [
        {
          id: job.id,
          name: job.name,
          status: job.status,
          createdAt: job.createdAt,
          findingsCount: 12,
        },
      ],
      nextCursor: 'eyJpZCI6',
    };

    expect(response.jobs).toHaveLength(1);
  });

  it('describes an error body', () => {
    const response: ErrorResponse = { error: 'Trabajo no encontrado' };

    expect(response.error).toBe('Trabajo no encontrado');
  });
});
