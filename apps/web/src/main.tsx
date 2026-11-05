// Entry point of the web app: mounts React into <div id="root"> of index.html.

import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';

import { createQueryClient } from './query-client';
import { router } from './routes';
import './styles.css';

const queryClient = createQueryClient();

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('index.html must contain <div id="root">');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
