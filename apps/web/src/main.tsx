// Entry point of the web app: mounts React into <div id="root"> of index.html.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';

import { App, createAppQueryClient } from './app';
import { routes } from './routes';
import './styles.css';

const router = createBrowserRouter(routes);
const queryClient = createAppQueryClient(router);

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('index.html must contain <div id="root">');
}

createRoot(rootElement).render(
  <StrictMode>
    <App router={router} queryClient={queryClient} />
  </StrictMode>,
);
