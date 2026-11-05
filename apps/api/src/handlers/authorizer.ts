// Lambda authorizer of the HTTP API (ADR-0006, NFR-SEC-01).
//
// API Gateway calls it before every route with the request headers and only
// lets the request through when it returns `{ isAuthorized: true }` ("simple
// response" format). A request without an `Authorization` header never gets
// here: API Gateway answers 401 by itself. `{ isAuthorized: false }` becomes a 403.
//
// NEVER log the provided or the expected password (NFR-OBS-03).

import type {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerResult,
} from 'aws-lambda';

import { getAppPasswordParam, getSecureParameter } from '../lib/config';
import * as logger from '../lib/logger';
import { extractBearerToken, passwordsMatch } from '../lib/password';

const ALLOW: APIGatewaySimpleAuthorizerResult = { isAuthorized: true };
const DENY: APIGatewaySimpleAuthorizerResult = { isAuthorized: false };

export async function handler(
  event: APIGatewayRequestAuthorizerEventV2,
): Promise<APIGatewaySimpleAuthorizerResult> {
  // HTTP APIs (payload 2.0) give header names in lower case.
  const token = extractBearerToken(event.headers?.['authorization']);
  if (token === null) {
    logger.warn('Authorization denied', {
      reason: 'missing or malformed header',
    });
    return DENY;
  }

  const expectedPassword = await readExpectedPassword();
  if (expectedPassword === null) {
    return DENY;
  }

  if (!passwordsMatch(token, expectedPassword)) {
    logger.warn('Authorization denied', { reason: 'wrong password' });
    return DENY;
  }

  return ALLOW;
}

/**
 * Reads the app password from SSM (cached for the life of the container by
 * `getSecureParameter`). Returns `null` if SSM fails: without the expected
 * password nobody can be let in, so the request is denied instead of crashing.
 */
async function readExpectedPassword(): Promise<string | null> {
  const parameterName = getAppPasswordParam();
  try {
    return await getSecureParameter(parameterName);
  } catch (err) {
    // The error comes from SSM and holds no secret value; log the name only.
    logger.error('Could not read the app password from SSM', {
      parameterName,
      error: err,
    });
    return null;
  }
}
