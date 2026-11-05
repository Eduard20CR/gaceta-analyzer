import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { APIGatewayRequestAuthorizerEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { handler } from '../src/handlers/authorizer';
import { clearParameterCacheForTests } from '../src/lib/config';

// No test calls AWS: aws-sdk-client-mock intercepts every SSMClient.
const ssmMock = mockClient(SSMClient);

const PASSWORD = 'la-clave-de-mama';
const PARAM = '/gaceta-analyzer/app-password';

/** A minimal authorizer event: the handler only reads the headers. */
function eventWith(
  headers: Record<string, string> | undefined,
): APIGatewayRequestAuthorizerEventV2 {
  const event = {
    version: '2.0',
    type: 'REQUEST',
    routeArn: 'arn:aws:execute-api:us-east-1:123:api/$default/GET/api/jobs',
    identitySource: [],
    routeKey: 'GET /api/jobs',
    rawPath: '/api/jobs',
    rawQueryString: '',
    headers,
  };
  // The full event has many request-context fields the handler never reads.
  return event as unknown as APIGatewayRequestAuthorizerEventV2;
}

let stdout: MockInstance<typeof console.log>;
let stderr: MockInstance<typeof console.error>;

/** Every line written by the logger during the test. */
function allLogLines(): string {
  const lines = [...stdout.mock.calls, ...stderr.mock.calls];
  return lines.map((args) => args.join(' ')).join('\n');
}

beforeEach(() => {
  ssmMock.reset();
  ssmMock
    .on(GetParameterCommand, { Name: PARAM, WithDecryption: true })
    .resolves({ Parameter: { Value: PASSWORD } });
  clearParameterCacheForTests();
  vi.stubEnv('APP_PASSWORD_PARAM', PARAM);
  stdout = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('authorizer handler', () => {
  it('authorizes the correct password', async () => {
    const result = await handler(
      eventWith({ authorization: `Bearer ${PASSWORD}` }),
    );

    expect(result).toEqual({ isAuthorized: true });
  });

  it.each([
    ['a wrong password', { authorization: 'Bearer la-clave-de-mamb' }],
    ['a different-length password', { authorization: 'Bearer x' }],
    ['an empty token', { authorization: 'Bearer ' }],
    ['a non-Bearer scheme', { authorization: `Basic ${PASSWORD}` }],
    ['a missing header', {}],
  ])('denies %s', async (_label, headers) => {
    const result = await handler(eventWith(headers));

    expect(result).toEqual({ isAuthorized: false });
  });

  it('denies an event without headers at all', async () => {
    expect(await handler(eventWith(undefined))).toEqual({
      isAuthorized: false,
    });
  });

  it('reads SSM only once across invocations', async () => {
    await handler(eventWith({ authorization: `Bearer ${PASSWORD}` }));
    await handler(eventWith({ authorization: 'Bearer otra' }));
    await handler(eventWith({ authorization: `Bearer ${PASSWORD}` }));

    expect(ssmMock.commandCalls(GetParameterCommand)).toHaveLength(1);
  });

  it('denies and logs the error when SSM fails', async () => {
    ssmMock.on(GetParameterCommand).rejects(new Error('SSM is down'));

    const result = await handler(
      eventWith({ authorization: `Bearer ${PASSWORD}` }),
    );

    expect(result).toEqual({ isAuthorized: false });
    expect(allLogLines()).toContain('SSM is down');
    expect(allLogLines()).toContain(PARAM);
  });

  it('never logs the provided or the expected password', async () => {
    const wrongPassword = 'clave-equivocada-123';

    await handler(eventWith({ authorization: `Bearer ${PASSWORD}` }));
    await handler(eventWith({ authorization: `Bearer ${wrongPassword}` }));
    ssmMock.on(GetParameterCommand).rejects(new Error('SSM is down'));
    clearParameterCacheForTests();
    await handler(eventWith({ authorization: `Bearer ${wrongPassword}` }));

    // Something was logged (the denials), but never a password.
    expect(allLogLines()).not.toBe('');
    expect(allLogLines()).not.toContain(PASSWORD);
    expect(allLogLines()).not.toContain(wrongPassword);
  });
});
