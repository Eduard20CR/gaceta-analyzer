import { Navigate, Outlet, useLocation } from 'react-router';

import { getPassword } from '../api';
import { LOGIN_PATH, loginRedirectState } from '../auth';

/**
 * Route guard (FR-01): shows the page only when a password is stored.
 * Otherwise it opens the login page and tells it which page the user wanted,
 * so the login page can come back here afterwards.
 */
export function RequireAuth() {
  const location = useLocation();

  if (getPassword() === null) {
    return (
      <Navigate to={LOGIN_PATH} replace state={loginRedirectState(location)} />
    );
  }
  return <Outlet />;
}
