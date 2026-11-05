// The app's pages and their addresses (ADR-0008). CloudFront sends every one of
// these paths to index.html (spa-rewrite), so React Router can show the page.

import { Outlet, useLocation } from 'react-router';
import type { RouteObject } from 'react-router';

import { LOGIN_PATH } from './auth';
import { Layout } from './components/Layout';
import { LogoutButton } from './components/LogoutButton';
import { RequireAuth } from './components/RequireAuth';
import { JobDetailPage } from './pages/JobDetailPage';
import { JobListPage } from './pages/JobListPage';
import { LoginPage } from './pages/LoginPage';
import { NewJobPage } from './pages/NewJobPage';
import { NotFoundPage } from './pages/NotFoundPage';

/**
 * Every page is shown inside the layout: `<Outlet />` is where the page goes.
 * Every page except the login page needs the password (RequireAuth below), so
 * "Cerrar sesión" is shown everywhere except on the login page.
 */
function AppLayout() {
  const { pathname } = useLocation();
  const isLoginPage = pathname === LOGIN_PATH;

  return (
    <Layout headerActions={isLoginPage ? undefined : <LogoutButton />}>
      <Outlet />
    </Layout>
  );
}

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: LOGIN_PATH, element: <LoginPage /> },
      {
        // Without a stored password, these pages redirect to the login page (FR-01).
        element: <RequireAuth />,
        children: [
          { path: '/', element: <JobListPage /> },
          { path: '/jobs/new', element: <NewJobPage /> },
          { path: '/jobs/:id', element: <JobDetailPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
