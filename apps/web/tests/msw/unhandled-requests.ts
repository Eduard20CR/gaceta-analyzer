// Requests the app made that no MSW handler answered.
//
// tests/setup.ts adds to this list and fails the test that made them, so a test
// can never pass while silently depending on the real network.

const unhandledRequests: string[] = [];

export function recordUnhandledRequest(description: string): void {
  unhandledRequests.push(description);
}

/** Returns the recorded requests and empties the list. */
export function takeUnhandledRequests(): string[] {
  return unhandledRequests.splice(0);
}
