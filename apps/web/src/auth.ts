// Session rules of the web app (FR-01, ADR-0006).
//
// "Logged in" simply means a password is stored in localStorage (see
// api/auth-storage.ts). These helpers keep the rules for leaving and coming
// back to the login page in one place.

import type { QueryClient } from '@tanstack/react-query';
import type { Location } from 'react-router';

import { clearPassword } from './api';

export const LOGIN_PATH = '/login';

/** Where to go after logging in when the user did not ask for a specific page. */
const DEFAULT_PATH_AFTER_LOGIN = '/';

/**
 * What the app passes to the login page in the router's `state`, so that
 * after logging in it can send the user back to the page they wanted.
 */
export interface LoginRedirectState {
  from: string;
}

/** Forgets the password and every API response kept in memory. */
export function endSession(queryClient: QueryClient): void {
  clearPassword();
  // Without this, the next person to log in on this device would briefly see
  // the previous user's data from the cache.
  queryClient.clear();
}

/** The `state` to send to the login page from the page at `location`. */
export function loginRedirectState(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
): LoginRedirectState {
  return { from: location.pathname + location.search + location.hash };
}

/**
 * The page to open after logging in. The router state can be anything (for
 * example after a manual reload), so it is checked before it is trusted: only
 * paths inside this app are accepted, never the login page itself.
 */
export function pathAfterLogin(routerState: unknown): string {
  if (typeof routerState !== 'object' || routerState === null) {
    return DEFAULT_PATH_AFTER_LOGIN;
  }
  if (!('from' in routerState) || typeof routerState.from !== 'string') {
    return DEFAULT_PATH_AFTER_LOGIN;
  }

  const from = routerState.from;
  // "//example.com" would be read as another website, so it is rejected too.
  const isPathInThisApp = from.startsWith('/') && !from.startsWith('//');
  if (!isPathInThisApp || from.startsWith(LOGIN_PATH)) {
    return DEFAULT_PATH_AFTER_LOGIN;
  }
  return from;
}
