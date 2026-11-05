// All DynamoDB access of the app (ADR-0003, docs/architecture.md → "Data model").
// No other module may import the DynamoDB client: handlers call these functions.
//
// A few DynamoDB ideas used below, for readers new to DynamoDB:
//
// - Partition key: the attribute DynamoDB uses to find an item directly, like a
//   primary key in SQL. The `jobs` table uses `id`, so `getJob(id)` is a cheap
//   `GetItem` instead of a search.
// - Global secondary index (GSI): a second copy of the table, kept up to date by
//   DynamoDB, organized by other keys. The GSI `by-created-at` uses `entityType`
//   (always "JOB") as partition key and `createdAt` as sort key, so all jobs sit
//   in one partition sorted by date. That is what lets `listJobs` return the
//   newest jobs first without scanning the whole table.
// - Conditional write: a write with a `ConditionExpression`. DynamoDB checks the
//   condition and makes the change in one atomic step; if the condition is false,
//   nothing is written and it throws `ConditionalCheckFailedException`.
// - `LastEvaluatedKey`: a `Query` returns at most `Limit` items. When there are
//   more, it also returns the key of the last item it read; passing that key back
//   as `ExclusiveStartKey` continues right after it. That is our pagination cursor.

import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import { JOBS_PAGE_SIZE } from '@gaceta/shared';
import type { Job } from '@gaceta/shared';

import { getTableName } from './config';

/** Value of `entityType` on every job: the GSI partition key. */
export const JOB_ENTITY_TYPE = 'JOB';

/** Name of the GSI that sorts jobs by creation date. */
export const JOBS_BY_CREATED_AT_INDEX = 'by-created-at';

/** What `create-job` passes in: everything except the timestamps, which are set here. */
export type NewJob = Omit<Job, 'createdAt' | 'updatedAt'>;

/** The totals `analyze-pdf` knows once it has read the PDF. */
export interface JobTotals {
  pageCount: number;
  totalBlocks: number;
}

/** What `analyze-pdf` stores when an analysis finishes. */
export interface JobCompletion {
  findingsCount: number;
  relevantPages: number[];
  resultsKey: string;
  failedPages: number[];
  inputTokens: number;
  outputTokens: number;
}

/** One page of the job history. */
export interface JobsPage {
  /** Newest first. */
  jobs: Job[];
  /** Pass it to `listJobs` to get the next page; `null` when there are no more. */
  nextCursor: string | null;
}

/** Thrown by `listJobs` when the cursor was not produced by `listJobs`. */
export class InvalidCursorError extends Error {
  constructor() {
    super('Invalid pagination cursor');
    this.name = 'InvalidCursorError';
  }
}

// Created once per Lambda container and reused by every invocation. The
// "document client" converts between plain JavaScript values and DynamoDB's
// typed format ({ "S": "text" }, { "N": "5" }), so this file works with plain objects.
//
// `removeUndefinedValues` drops optional fields that are `undefined` instead of
// failing, because DynamoDB has no "undefined" type.
//
// Tests replace it with aws-sdk-client-mock, which intercepts every DynamoDBDocumentClient.
const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/** The item as stored in DynamoDB: a job plus the internal `entityType`. */
type JobItem = Job & { entityType: typeof JOB_ENTITY_TYPE };

/** Current time in full ISO 8601 UTC, for example "2026-11-04T20:18:00.000Z". */
function nowIso(): string {
  // `toISOString` always returns UTC with milliseconds and a trailing "Z". The
  // GSI sorts `createdAt` as text, which only matches date order when every
  // value has exactly this format.
  return new Date().toISOString();
}

/**
 * Stores a new job. Sets `createdAt`, `updatedAt` and `entityType`.
 * Fails if a job with the same id already exists (it never overwrites one).
 */
export async function createJob(newJob: NewJob): Promise<Job> {
  const now = nowIso();
  const job: Job = { ...newJob, createdAt: now, updatedAt: now };
  const item: JobItem = { ...job, entityType: JOB_ENTITY_TYPE };

  await documentClient.send(
    new PutCommand({
      TableName: getTableName(),
      Item: item,
      // A random UUID should never repeat, but if it did, overwriting another
      // user's job silently would be much worse than an error.
      ConditionExpression: 'attribute_not_exists(id)',
    }),
  );

  return job;
}

/** Returns the job, or `null` if it does not exist. */
export async function getJob(id: string): Promise<Job | null> {
  const output = await documentClient.send(
    new GetCommand({ TableName: getTableName(), Key: { id } }),
  );

  if (output.Item === undefined) {
    return null;
  }
  return toJob(output.Item);
}

/**
 * Moves a job from `PENDING_UPLOAD` to `PROCESSING` (ADR-0005, NFR-REL-02).
 *
 * Returns `true` if this call made the change, and `false` if the job was not in
 * `PENDING_UPLOAD` (for example, S3 delivered the same event twice and another
 * invocation already started it). Any other error is thrown.
 */
export async function startProcessing(id: string): Promise<boolean> {
  const now = nowIso();

  try {
    await documentClient.send(
      new UpdateCommand({
        TableName: getTableName(),
        Key: { id },
        UpdateExpression:
          'SET #status = :processing, startedAt = :now, updatedAt = :now',
        // The check and the change happen in one atomic step, so two
        // invocations can never both see PENDING_UPLOAD and both start.
        ConditionExpression: '#status = :pendingUpload',
        // `status` is a reserved word in DynamoDB expressions, so it is written
        // as the placeholder `#status`.
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':processing': 'PROCESSING',
          ':pendingUpload': 'PENDING_UPLOAD',
          ':now': now,
        },
      }),
    );
    return true;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      return false;
    }
    throw err;
  }
}

/** Stores the page and block counts once the PDF has been read. Progress starts at 0. */
export async function setTotals(id: string, totals: JobTotals): Promise<void> {
  await updateJob(id, {
    pageCount: totals.pageCount,
    totalBlocks: totals.totalBlocks,
    processedBlocks: 0,
  });
}

/** Stores how many blocks have been analyzed so far. */
export async function updateProgress(
  id: string,
  processedBlocks: number,
): Promise<void> {
  await updateJob(id, { processedBlocks });
}

/** Marks the job as `COMPLETED` with its summary (FR-03, NFR-COST-05). */
export async function completeJob(
  id: string,
  completion: JobCompletion,
): Promise<void> {
  await updateJob(id, {
    status: 'COMPLETED',
    findingsCount: completion.findingsCount,
    relevantPages: completion.relevantPages,
    resultsKey: completion.resultsKey,
    failedPages: completion.failedPages,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    completedAt: nowIso(),
  });
}

/** Marks the job as `FAILED`. `errorMessage` is shown to the user, so it must be in Spanish. */
export async function failJob(id: string, errorMessage: string): Promise<void> {
  await updateJob(id, {
    status: 'FAILED',
    errorMessage,
    completedAt: nowIso(),
  });
}

/**
 * Returns one page of jobs, newest first (FR-05).
 * `cursor` is the `nextCursor` of the previous page; leave it out for the first page.
 * Throws `InvalidCursorError` if the cursor is not one this function produced.
 */
export async function listJobs(cursor?: string): Promise<JobsPage> {
  const exclusiveStartKey =
    cursor === undefined ? undefined : decodeCursor(cursor);

  const output = await documentClient.send(
    new QueryCommand({
      TableName: getTableName(),
      IndexName: JOBS_BY_CREATED_AT_INDEX,
      KeyConditionExpression: 'entityType = :entityType',
      ExpressionAttributeValues: { ':entityType': JOB_ENTITY_TYPE },
      // false = descending order of the sort key (`createdAt`): newest first.
      ScanIndexForward: false,
      Limit: JOBS_PAGE_SIZE,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );

  const items = output.Items ?? [];
  const jobs = items.map((item) => toJob(item));

  let nextCursor: string | null = null;
  if (output.LastEvaluatedKey !== undefined) {
    nextCursor = encodeCursor(output.LastEvaluatedKey);
  }

  return { jobs, nextCursor };
}

/**
 * Sets the given fields on an existing job and refreshes `updatedAt`.
 * Throws `ConditionalCheckFailedException` if the job does not exist.
 */
async function updateJob(id: string, fields: Partial<Job>): Promise<void> {
  const allFields: Partial<Job> = { ...fields, updatedAt: nowIso() };

  // Builds "SET #status = :status, #completedAt = :completedAt, …".
  // Every attribute name goes through a "#name" placeholder, so we never have to
  // remember which words DynamoDB reserves (`status` is one of them).
  const assignments: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(allFields)) {
    assignments.push(`#${field} = :${field}`);
    names[`#${field}`] = field;
    values[`:${field}`] = value;
  }

  await documentClient.send(
    new UpdateCommand({
      TableName: getTableName(),
      Key: { id },
      UpdateExpression: `SET ${assignments.join(', ')}`,
      // Without this condition, updating a missing id would silently create a
      // half-empty item that has no `entityType` and never shows up in the list.
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

/** Removes `entityType`, an internal DynamoDB detail that no caller needs. */
function toJob(item: Record<string, unknown>): Job {
  const { entityType: _entityType, ...job } = item;
  // The table only contains items written by `createJob`, so the shape is a Job.
  return job as unknown as Job;
}

// The cursor is the GSI's `LastEvaluatedKey`: the table key (`id`) plus the index
// keys (`entityType`, `createdAt`). It is turned into base64url text so it can
// travel in a URL (`?cursor=…`) without escaping.
const CURSOR_KEYS = ['id', 'entityType', 'createdAt'];

/** `LastEvaluatedKey` → base64url text. */
export function encodeCursor(
  lastEvaluatedKey: Record<string, unknown>,
): string {
  const json = JSON.stringify(lastEvaluatedKey);
  return Buffer.from(json, 'utf8').toString('base64url');
}

/**
 * base64url text → `ExclusiveStartKey`.
 * Throws `InvalidCursorError` unless the text decodes to exactly the three
 * expected string keys. Anything else came from a typo or a tampered URL, and
 * DynamoDB would reject it with a less clear error.
 */
export function decodeCursor(cursor: string): Record<string, string> {
  let parsed: unknown;
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new InvalidCursorError();
  }

  if (!isCursorKey(parsed)) {
    throw new InvalidCursorError();
  }
  return parsed;
}

function isCursorKey(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value).sort();
  const expectedKeys = [...CURSOR_KEYS].sort();
  if (keys.join(',') !== expectedKeys.join(',')) {
    return false;
  }

  const entries = Object.values(value);
  return entries.every((entry) => typeof entry === 'string' && entry !== '');
}
