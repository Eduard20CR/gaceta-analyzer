// Typed client for the API under /api (docs/architecture.md → "API contract").
//
// Request and response types come from @gaceta/shared, so the web app and the
// API cannot disagree about a field (NFR-MAINT-06). Paths are relative, so the
// same code works behind CloudFront and behind the Vite dev server proxy.

import type {
  CreateJobRequestInput,
  CreateJobResponse,
  ErrorResponse,
  GetJobResponse,
  ListJobsResponse,
} from '@gaceta/shared';

import { getPassword } from './auth-storage';
import { API_ERROR_MESSAGES, ApiError, UnauthorizedError } from './errors';

/**
 * Checks a password against the API (FR-01): resolves if it is right, throws
 * `UnauthorizedError` if not. Without an argument, it checks the stored one.
 */
export async function checkAuth(password?: string): Promise<void> {
  await apiRequest('/api/auth/check', { method: 'GET' }, password);
}

/** One page of the job history, newest first (FR-05). */
export async function listJobs(cursor?: string): Promise<ListJobsResponse> {
  const path =
    cursor === undefined
      ? '/api/jobs'
      : `/api/jobs?cursor=${encodeURIComponent(cursor)}`;
  return parseJson<ListJobsResponse>(await apiRequest(path, { method: 'GET' }));
}

/** A job with its findings (when completed) and a link to the PDF (FR-04). */
export async function getJob(id: string): Promise<GetJobResponse> {
  const path = `/api/jobs/${encodeURIComponent(id)}`;
  return parseJson<GetJobResponse>(await apiRequest(path, { method: 'GET' }));
}

/** Creates a job and returns where to upload its PDF (FR-02). */
export async function createJob(
  request: CreateJobRequestInput,
): Promise<CreateJobResponse> {
  const response = await apiRequest('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return parseJson<CreateJobResponse>(response);
}

/**
 * Sends a request to the API with the password and turns failures into
 * `UnauthorizedError` or `ApiError`. Returns the response only when it is 2xx.
 */
async function apiRequest(
  path: string,
  init: RequestInit,
  password: string | null = getPassword(),
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (password !== null) {
    headers.set('Authorization', `Bearer ${password}`);
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    // fetch only throws when there is no response at all (offline, DNS, …).
    throw new ApiError(0, API_ERROR_MESSAGES.network);
  }

  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new ApiError(response.status, message);
  }
  return response;
}

/**
 * The Spanish `error` of an `ErrorResponse` body, or a generic message when the
 * body is not one (for example, an HTML error page from a proxy).
 */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Partial<ErrorResponse>;
    if (typeof body.error === 'string' && body.error !== '') {
      return body.error;
    }
  } catch {
    // Not JSON: use the generic message below.
  }
  return API_ERROR_MESSAGES.unexpected;
}

async function parseJson<T>(response: Response): Promise<T> {
  // The API is ours and typed by @gaceta/shared, so the body is trusted to have
  // the declared shape instead of being validated again here.
  return (await response.json()) as T;
}
