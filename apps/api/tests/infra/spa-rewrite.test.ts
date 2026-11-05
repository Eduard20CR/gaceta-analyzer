// Tests the CloudFront Function in infra/main/functions/spa-rewrite.js (#32).
//
// The function is a plain script with a top-level `handler`, as CloudFront
// requires, so it cannot be imported. The test reads the file and runs it to
// get `handler`, which tests the exact code that is deployed.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

interface CloudFrontRequest {
  uri: string;
  method: string;
}

type Handler = (event: { request: CloudFrontRequest }) => CloudFrontRequest;

const FUNCTION_PATH = path.join(
  import.meta.dirname,
  '../../../../infra/main/functions/spa-rewrite.js',
);

function loadHandler(): Handler {
  const source = readFileSync(FUNCTION_PATH, 'utf8');
  // Runs the script and returns its `handler`, like CloudFront does.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the deployed source must be run as is
  const createHandler = new Function(
    `${source}\nreturn handler;`,
  ) as () => Handler;
  return createHandler();
}

const handler = loadHandler();

function rewrite(uri: string): string {
  return handler({ request: { uri, method: 'GET' } }).uri;
}

describe('spa-rewrite CloudFront Function', () => {
  it.each([
    '/',
    '/jobs/abc',
    '/jobs/new',
    '/login',
    '/jobs/3f6c2a1e-1111-4222-8333-444455556666',
  ])('sends %s to /index.html', (uri) => {
    expect(rewrite(uri)).toBe('/index.html');
  });

  it.each([
    '/assets/app.123.js',
    '/assets/index-abc.css',
    '/favicon.svg',
    '/index.html',
  ])('leaves the file %s as it is', (uri) => {
    expect(rewrite(uri)).toBe(uri);
  });

  it('keeps the rest of the request', () => {
    const request = handler({ request: { uri: '/jobs/abc', method: 'HEAD' } });

    expect(request).toEqual({ uri: '/index.html', method: 'HEAD' });
  });
});
