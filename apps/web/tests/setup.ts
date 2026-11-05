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
  server.listen({ onUnhandledFrame: blockUnhandledRequest });
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

/**
 * Called by MSW for every request that no handler answered. Tests must never
 * reach a real server, so the request is blocked: throwing here makes MSW
 * answer it with an error instead of sending it to the network.
 *
 * The app turns network errors into a Spanish message, so a page could hide
 * that failure and the test could still pass. Recording the request lets the
 * check in afterEach fail the test that made it.
 *
 * (MSW's own `'error'` option is not used: with a custom function like this
 * one, MSW 3 only blocks the request if the function throws.)
 */
function blockUnhandledRequest({
  frame,
}: {
  frame: { protocol: string; data: unknown };
}): never {
  const description = describeFrame(frame);
  recordUnhandledRequest(description);
  throw new Error(`Blocked a request without an MSW handler: ${description}`);
}

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
