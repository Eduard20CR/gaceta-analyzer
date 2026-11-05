// Runs before every test file (vitest.config.ts → setupFiles).

// Adds DOM matchers such as `toBeInTheDocument()` and `toBeDisabled()` to `expect`.
import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './msw/server';
import {
  recordUnhandledRequest,
  takeUnhandledRequests,
} from './msw/unhandled-requests';

beforeAll(() => {
  // Tests must never reach a real server. A request with no handler is an
  // error (MSW logs it and the request fails), and is also recorded so the
  // check in afterEach fails the test even if the app swallows the network error.
  server.listen({
    onUnhandledFrame: ({ frame, defaults }) => {
      recordUnhandledRequest(describeFrame(frame));
      defaults.error();
    },
  });
});

afterEach(() => {
  // Unmount what the test rendered, so the next test starts with an empty page.
  cleanup();
  // Remove the overrides a test added with `server.use(...)`.
  server.resetHandlers();
  // The stored password must not leak from one test to the next.
  localStorage.clear();

  const unhandled = takeUnhandledRequests();
  if (unhandled.length > 0) {
    throw new Error(`Request without an MSW handler: ${unhandled.join(', ')}`);
  }
});

afterAll(() => {
  server.close();
});

/** "GET http://localhost:3000/api/x" for an HTTP request, the protocol otherwise. */
function describeFrame(frame: { protocol: string; data: unknown }): string {
  const data = frame.data;
  if (
    typeof data === 'object' &&
    data !== null &&
    'request' in data &&
    data.request instanceof Request
  ) {
    return `${data.request.method} ${data.request.url}`;
  }
  return `${frame.protocol} frame`;
}
