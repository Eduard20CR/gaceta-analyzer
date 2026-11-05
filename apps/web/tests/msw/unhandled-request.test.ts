import { describe, expect, it } from 'vitest';

import { takeUnhandledRequests } from './unhandled-requests';

// Proves the safety net in tests/setup.ts: a request with no MSW handler never
// reaches the real network, and it is recorded so afterEach fails the test.
describe('unmocked requests', () => {
  it('are answered by MSW with an error instead of reaching the network', async () => {
    const response = await fetch('https://example.com/not-mocked');

    // MSW answers by itself with a 500 "Unhandled Exception" response: the
    // real example.com was never contacted.
    expect(response.status).toBe(500);
    expect(response.statusText).toBe('Unhandled Exception');

    // Taking the record here keeps afterEach from failing this one test on
    // purpose; in any other test the same record would make it fail.
    expect(takeUnhandledRequests()).toEqual([
      'GET https://example.com/not-mocked',
    ]);
  });
});
