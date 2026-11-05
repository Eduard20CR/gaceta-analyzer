// Puts the router and the query client together. main.tsx uses it with the
// browser router; the tests use it with a memory router, so they run the same
// wiring as the real app.

import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { DataRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { LOGIN_PATH, endSession, loginRedirectState } from './auth';
import { createQueryClient } from './query-client';

/**
 * The app's query client. A 401/403 from any API call means the stored
 * password is no longer valid (FR-01): forget it and ask for it again,
 * remembering the current page so the user comes back to it after logging in.
 */
export function createAppQueryClient(router: DataRouter): QueryClient {
  const queryClient = createQueryClient({
    onUnauthorized: () => {
      const currentLocation = router.state.location;
      endSession(queryClient);
      void router.navigate(LOGIN_PATH, {
        replace: true,
        state: loginRedirectState(currentLocation),
      });
    },
  });
  return queryClient;
}

interface AppProps {
  router: DataRouter;
  queryClient: QueryClient;
}

export function App({ router, queryClient }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
