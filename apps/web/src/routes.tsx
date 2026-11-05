// The app's pages and their addresses (ADR-0008). CloudFront sends every one of
// these paths to index.html (spa-rewrite), so React Router can show the page.

import { Outlet, createBrowserRouter } from 'react-router';

import { Layout } from './components/Layout';
import { JobDetailPage } from './pages/JobDetailPage';
import { JobListPage } from './pages/JobListPage';
import { LoginPage } from './pages/LoginPage';
import { NewJobPage } from './pages/NewJobPage';
import { NotFoundPage } from './pages/NotFoundPage';

/** Every page is shown inside the layout: `<Outlet />` is where the page goes. */
function AppLayout() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

export const routes = [
  {
    element: <AppLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/', element: <JobListPage /> },
      { path: '/jobs/new', element: <NewJobPage /> },
      { path: '/jobs/:id', element: <JobDetailPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
