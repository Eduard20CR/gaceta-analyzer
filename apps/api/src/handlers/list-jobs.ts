// GET /api/jobs?cursor=… and GET /api/auth/check (FR-05, FR-01,
// docs/architecture.md → "API contract").
//
// Both routes are served by this Lambda to avoid an extra one. The auth check
// has nothing to do: API Gateway only lets a request reach a handler after the
// authorizer approved its password, so getting here already means "logged in".

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

import type { Job, JobSummary, ListJobsResponse } from '@gaceta/shared';

import {
  badRequest,
  internalError,
  jsonResponse,
  noContent,
  notFound,
} from '../lib/http';
import { applyExpiration } from '../lib/job-expiration';
import { InvalidCursorError, listJobs } from '../lib/jobs-repository';
import { createLogger } from '../lib/logger';

export const AUTH_CHECK_ROUTE = 'GET /api/auth/check';
export const LIST_JOBS_ROUTE = 'GET /api/jobs';

/** Shown to the user, in Spanish. */
export const LIST_JOBS_MESSAGES = {
  invalidCursor: 'La página solicitada no es válida. Vuelva al inicio.',
  routeNotFound: 'La ruta solicitada no existe',
} as const;

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.routeKey === AUTH_CHECK_ROUTE) {
    return noContent();
  }
  if (event.routeKey === LIST_JOBS_ROUTE) {
    return listJobsPage(event.queryStringParameters?.['cursor']);
  }
  return notFound(LIST_JOBS_MESSAGES.routeNotFound);
}

async function listJobsPage(
  cursor: string | undefined,
): Promise<APIGatewayProxyStructuredResultV2> {
  // `?cursor=` with nothing after it means "first page", like no cursor at all.
  const pageCursor = cursor === '' ? undefined : cursor;

  try {
    const page = await listJobs(pageCursor);
    const body: ListJobsResponse = {
      jobs: page.jobs.map((job) => toSummary(applyExpiration(job))),
      nextCursor: page.nextCursor,
    };
    return jsonResponse(200, body);
  } catch (error) {
    if (error instanceof InvalidCursorError) {
      return badRequest(LIST_JOBS_MESSAGES.invalidCursor);
    }
    createLogger().error('Could not list the jobs', { error });
    return internalError();
  }
}

/** Only the fields the history list shows (FR-05), so the response stays small. */
export function toSummary(job: Job): JobSummary {
  const summary: JobSummary = {
    id: job.id,
    name: job.name,
    status: job.status,
    createdAt: job.createdAt,
  };
  // Only completed jobs have a count. The key is left out otherwise, instead of
  // being set to `undefined`, as the `JobSummary` type requires.
  if (job.findingsCount !== undefined) {
    summary.findingsCount = job.findingsCount;
  }
  return summary;
}
