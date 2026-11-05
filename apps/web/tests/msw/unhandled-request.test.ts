import { describe, expect, it } from 'vitest';

import { takeUnhandledRequests } from './unhandled-requests';

// Proves the safety net in tests/setup.ts: a request with no MSW handler never
// reaches the real network, and it is recorded so afterEach fails the test.
describe('unmocked requests', () => {
  it('fail instead of reaching the network and are recorded', async () => {
    await expect(fetch('https://example.com/not-mocked')).rejects.toThrow();

    // Taking the record here keeps afterEach from failing this one test on
    // purpose; in any other test the same record would make it fail.
    expect(takeUnhandledRequests()).toEqual([
      'GET https://example.com/not-mocked',
    ]);
  });
});
