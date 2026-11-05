// Common HTTP responses for the handlers behind API Gateway (HTTP API, payload v2).
//
// Every error body has the shape `{ "error": "<message in Spanish>" }`
// (docs/architecture.md → "API contract"), so the web app can show it as it is.

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

import type { ErrorResponse } from '@gaceta/shared';

/** What a handler returns to API Gateway. */
export type HttpResponse = APIGatewayProxyStructuredResultV2;

/** Messages shown to the user, in Spanish. */
export const HTTP_MESSAGES = {
  invalidJson: 'El cuerpo de la solicitud no es JSON válido',
  internalError: 'Ocurrió un error inesperado. Intente de nuevo más tarde.',
} as const;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** A response with a JSON body. */
export function jsonResponse(statusCode: number, body: unknown): HttpResponse {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

/** 204, for example for `GET /api/auth/check`. */
export function noContent(): HttpResponse {
  return { statusCode: 204 };
}

/** 400 with a message in Spanish that tells the user what is wrong. */
export function badRequest(message: string): HttpResponse {
  return errorResponse(400, message);
}

/** 404 with a message in Spanish, for example "El análisis no existe". */
export function notFound(message: string): HttpResponse {
  return errorResponse(404, message);
}

/**
 * 500 with a generic message. The real cause goes to the logs, never to the
 * user: it could contain internal details.
 */
export function internalError(): HttpResponse {
  return errorResponse(500, HTTP_MESSAGES.internalError);
}

function errorResponse(statusCode: number, message: string): HttpResponse {
  const body: ErrorResponse = { error: message };
  return jsonResponse(statusCode, body);
}

/**
 * The result of `parseJsonBody`. Instead of throwing, it says whether parsing
 * worked, so the handler cannot forget to handle bad input:
 *
 *   const parsed = parseJsonBody(event);
 *   if (!parsed.ok) return parsed.response;
 *   // parsed.value is the JSON (still unknown: validate it with Zod)
 */
export type ParseJsonBodyResult =
  { ok: true; value: unknown } | { ok: false; response: HttpResponse };

/** Parses the request body as JSON. An empty or invalid body is a 400. */
export function parseJsonBody(
  event: Pick<APIGatewayProxyEventV2, 'body' | 'isBase64Encoded'>,
): ParseJsonBodyResult {
  if (event.body === undefined || event.body === '') {
    return { ok: false, response: badRequest(HTTP_MESSAGES.invalidJson) };
  }

  // API Gateway may send the body base64-encoded, depending on its content type.
  const text = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: badRequest(HTTP_MESSAGES.invalidJson) };
  }
}
