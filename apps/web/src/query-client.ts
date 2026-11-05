// Shared TanStack Query settings (ADR-0008).

import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { ApiError, UnauthorizedError } from './api';

// A failed request is tried again a couple of times, which hides short network
// problems. A wrong password is not retried: it will not become right. Neither
// is a 404: a job that does not exist will not appear by asking again.
const MAX_RETRIES = 2;

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof UnauthorizedError) {
    return false;
  }
  if (error instanceof ApiError && error.status === 404) {
    return false;
  }
  return failureCount < MAX_RETRIES;
}

interface QueryClientOptions {
  /**
   * Called when any query or mutation fails because the password is missing
   * or wrong (401/403). The app uses it to log out and show the login page (FR-01).
   */
  onUnauthorized: () => void;
}

export function createQueryClient({
  onUnauthorized,
}: QueryClientOptions): QueryClient {
  // The caches see the error of every query and mutation of the app, so pages
  // do not have to handle a 401/403 one by one.
  function handleError(error: unknown): void {
    if (error instanceof UnauthorizedError) {
      onUnauthorized();
    }
  }

  return new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      queries: { retry: shouldRetry },
    },
  });
}
