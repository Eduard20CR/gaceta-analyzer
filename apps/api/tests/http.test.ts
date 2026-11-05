import { describe, expect, it } from 'vitest';

import {
  HTTP_MESSAGES,
  badRequest,
  internalError,
  jsonResponse,
  noContent,
  notFound,
  parseJsonBody,
} from '../src/lib/http';

describe('jsonResponse', () => {
  it('returns the status code, the JSON header and the body as JSON', () => {
    const response = jsonResponse(201, { job: { id: 'abc' } });

    expect(response).toEqual({
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: '{"job":{"id":"abc"}}',
    });
  });
});

describe('noContent', () => {
  it('returns 204 without a body', () => {
    expect(noContent()).toEqual({ statusCode: 204 });
  });
});

describe('error responses', () => {
  it('badRequest returns 400 with { error }', () => {
    const response = badRequest('El nombre es obligatorio');

    expect(response.statusCode).toBe(400);
    expect(response.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(response.body ?? '')).toEqual({
      error: 'El nombre es obligatorio',
    });
  });

  it('notFound returns 404 with { error }', () => {
    const response = notFound('El análisis no existe');

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body ?? '')).toEqual({
      error: 'El análisis no existe',
    });
  });

  it('internalError returns 500 with a generic Spanish message', () => {
    const response = internalError();

    expect(response.statusCode).toBe(500);
    expect(response.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(response.body ?? '')).toEqual({
      error: HTTP_MESSAGES.internalError,
    });
  });
});

describe('parseJsonBody', () => {
  it('returns the parsed value for a valid body', () => {
    const result = parseJsonBody({
      body: '{"name":"Gaceta 4 nov"}',
      isBase64Encoded: false,
    });

    expect(result).toEqual({ ok: true, value: { name: 'Gaceta 4 nov' } });
  });

  it('decodes a base64-encoded body', () => {
    const body = Buffer.from('{"name":"Gaceta"}', 'utf8').toString('base64');

    const result = parseJsonBody({ body, isBase64Encoded: true });

    expect(result).toEqual({ ok: true, value: { name: 'Gaceta' } });
  });

  it.each([
    ['invalid JSON', '{name:'],
    ['an empty body', ''],
    ['a missing body', undefined],
  ])('returns a 400 failure for %s instead of throwing', (_label, body) => {
    const event =
      body === undefined
        ? { isBase64Encoded: false }
        : { body, isBase64Encoded: false };

    const result = parseJsonBody(event);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.statusCode).toBe(400);
      expect(JSON.parse(result.response.body ?? '')).toEqual({
        error: HTTP_MESSAGES.invalidJson,
      });
    }
  });
});
