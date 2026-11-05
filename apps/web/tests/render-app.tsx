// Renders a piece of the app with everything it needs around it.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';

interface RenderOptions {
  /** Address the router starts at, for example "/jobs/abc". Default "/". */
  route?: string;
}

/**
 * Renders `ui` inside a new QueryClient and a MemoryRouter.
 *
 * Both are created again on every call, so each test starts clean: no cached
 * data from a previous test, and the address the test asked for.
 * Retries are off so a failing request shows its error right away instead of
 * waiting for the retry delays.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderOptions = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[options.route ?? '/']}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

  return { ...result, queryClient };
}
