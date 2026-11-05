// Renders a piece of the app with everything it needs around it.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, createMemoryRouter } from 'react-router';

import { App, createAppQueryClient } from '../src/app';
import { routes } from '../src/routes';

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

/**
 * Renders the whole app (real routes, real query client wiring from
 * src/app.tsx) starting at `route`. Use it when a test needs what main.tsx
 * sets up, for example the redirect to the login page on a 401/403.
 *
 * Returns the router and the query client so a test can check the current
 * address or trigger a request.
 */
export function renderApp(route = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [route] });
  const queryClient = createAppQueryClient(router);

  const result = render(<App router={router} queryClient={queryClient} />);

  return { ...result, router, queryClient };
}
