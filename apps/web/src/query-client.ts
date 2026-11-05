// Shared TanStack Query settings (ADR-0008).

import { QueryClient } from '@tanstack/react-query';

import { UnauthorizedError } from './api';

// A failed request is tried again a couple of times, which hides short network
// problems. A wrong password is not retried: it will not become right.
const MAX_RETRIES = 2;

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof UnauthorizedError) {
    return false;
  }
  return failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry },
    },
  });
}
