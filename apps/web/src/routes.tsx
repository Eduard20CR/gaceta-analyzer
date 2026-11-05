// The app's pages and their addresses (ADR-0008). CloudFront sends every one of
// these paths to index.html (spa-rewrite), so React Router can show the page.

import { createBrowserRouter } from 'react-router';

import { JobDetailPage } from './pages/JobDetailPage';
import { JobListPage } from './pages/JobListPage';
import { LoginPage } from './pages/LoginPage';
import { NewJobPage } from './pages/NewJobPage';
import { NotFoundPage } from './pages/NotFoundPage';

export const routes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <JobListPage /> },
  { path: '/jobs/new', element: <NewJobPage /> },
  { path: '/jobs/:id', element: <JobDetailPage /> },
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);
