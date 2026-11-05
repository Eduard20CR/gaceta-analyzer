// POST /api/jobs (FR-02, docs/architecture.md → "Main flow" step 1).
//
// Validates the request, stores a new job in PENDING_UPLOAD and returns it with
// the presigned POST the browser uses to upload the PDF straight to S3
// (ADR-0005). This handler only orchestrates: the rules live in
// `@gaceta/shared` (validation) and in `lib/` (DynamoDB and S3).
//
// NEVER log the query: it is the user's text. Log ids and sizes instead.

import { randomUUID } from 'node:crypto';

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

import { createJobRequestSchema } from '@gaceta/shared';
import type { CreateJobRequest, CreateJobResponse } from '@gaceta/shared';

import {
  badRequest,
  internalError,
  jsonResponse,
  parseJsonBody,
} from '../lib/http';
import { createJob } from '../lib/jobs-repository';
import type { NewJob } from '../lib/jobs-repository';
import { createLogger } from '../lib/logger';
import { createUploadPost, uploadKey } from '../lib/storage';

/** Used when Zod returns no issue message, which should never happen. */
const GENERIC_VALIDATION_MESSAGE = 'Los datos del análisis no son válidos';

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const parsed = parseJsonBody(event);
  if (!parsed.ok) {
    return parsed.response;
  }

  const validation = createJobRequestSchema.safeParse(parsed.value);
  if (!validation.success) {
    // The schema messages are already in Spanish; the first one is enough for
    // the user to know what to fix.
    const firstIssue = validation.error.issues[0];
    return badRequest(firstIssue?.message ?? GENERIC_VALIDATION_MESSAGE);
  }

  const id = randomUUID();
  const log = createLogger({ jobId: id });

  try {
    const job = await createJob(buildNewJob(id, validation.data));
    const upload = await createUploadPost(id);

    log.info('Job created', {
      fileSize: job.fileSize,
      pagesPerBlock: job.pagesPerBlock,
    });

    const body: CreateJobResponse = { job, upload };
    return jsonResponse(201, body);
  } catch (error) {
    log.error('Could not create the job', { error });
    return internalError();
  }
}

/** The job as it is stored before the PDF is uploaded. */
export function buildNewJob(id: string, request: CreateJobRequest): NewJob {
  // FR-02: when the user leaves the name empty, the file name is used.
  // The schema already trimmed it, so "   " arrives here as "".
  const name =
    request.name === undefined || request.name === ''
      ? request.fileName
      : request.name;

  return {
    id,
    name,
    query: request.query,
    pagesPerBlock: request.pagesPerBlock,
    fileName: request.fileName,
    fileSize: request.fileSize,
    pdfKey: uploadKey(id),
    status: 'PENDING_UPLOAD',
  };
}
