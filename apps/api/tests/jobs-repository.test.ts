import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Job } from '@gaceta/shared';

import {
  InvalidCursorError,
  completeJob,
  createJob,
  decodeCursor,
  encodeCursor,
  failJob,
  getJob,
  listJobs,
  setTotals,
  startProcessing,
  updateProgress,
} from '../src/lib/jobs-repository';
import type { NewJob } from '../src/lib/jobs-repository';

// No test calls AWS: aws-sdk-client-mock intercepts every DynamoDBDocumentClient.
const dynamoMock = mockClient(DynamoDBDocumentClient);

const TABLE = 'gaceta-analyzer-jobs';
const NOW = '2026-11-05T10:00:00.000Z';
const ID = '3f6c2a1e-1111-4222-8333-444455556666';

const NEW_JOB: NewJob = {
  id: ID,
  name: 'Gaceta 4 de noviembre',
  query: 'impuestos, aranceles',
  pagesPerBlock: 5,
  fileName: 'gaceta.pdf',
  fileSize: 8_388_608,
  pdfKey: `uploads/${ID}.pdf`,
  status: 'PENDING_UPLOAD',
};

const STORED_JOB: Job = { ...NEW_JOB, createdAt: NOW, updatedAt: NOW };

function conditionFailed(): ConditionalCheckFailedException {
  return new ConditionalCheckFailedException({
    message: 'The conditional request failed',
    $metadata: {},
  });
}

beforeEach(() => {
  dynamoMock.reset();
  vi.stubEnv('TABLE_NAME', TABLE);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('createJob', () => {
  it('puts the item with entityType and timestamps, without overwriting', async () => {
    dynamoMock.on(PutCommand).resolves({});

    const job = await createJob(NEW_JOB);

    expect(job).toEqual(STORED_JOB);
    expect(dynamoMock.commandCalls(PutCommand)[0]?.args[0].input).toEqual({
      TableName: TABLE,
      Item: { ...STORED_JOB, entityType: 'JOB' },
      ConditionExpression: 'attribute_not_exists(id)',
    });
  });

  it('writes createdAt in full ISO 8601 UTC', async () => {
    dynamoMock.on(PutCommand).resolves({});

    const job = await createJob(NEW_JOB);

    expect(job.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });
});

describe('getJob', () => {
  it('returns the job without entityType', async () => {
    dynamoMock
      .on(GetCommand)
      .resolves({ Item: { ...STORED_JOB, entityType: 'JOB' } });

    const job = await getJob(ID);

    expect(job).toEqual(STORED_JOB);
    expect(dynamoMock.commandCalls(GetCommand)[0]?.args[0].input).toEqual({
      TableName: TABLE,
      Key: { id: ID },
    });
  });

  it('returns null when the job does not exist', async () => {
    dynamoMock.on(GetCommand).resolves({});

    expect(await getJob(ID)).toBeNull();
  });
});

describe('startProcessing', () => {
  it('moves PENDING_UPLOAD to PROCESSING with a conditional update', async () => {
    dynamoMock.on(UpdateCommand).resolves({});

    expect(await startProcessing(ID)).toBe(true);
    expect(dynamoMock.commandCalls(UpdateCommand)[0]?.args[0].input).toEqual({
      TableName: TABLE,
      Key: { id: ID },
      UpdateExpression:
        'SET #status = :processing, startedAt = :now, updatedAt = :now',
      ConditionExpression: '#status = :pendingUpload',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':processing': 'PROCESSING',
        ':pendingUpload': 'PENDING_UPLOAD',
        ':now': NOW,
      },
    });
  });

  it('returns false without throwing when the condition fails (duplicate event)', async () => {
    dynamoMock.on(UpdateCommand).rejects(conditionFailed());

    expect(await startProcessing(ID)).toBe(false);
  });

  it('throws any other error', async () => {
    dynamoMock.on(UpdateCommand).rejects(new Error('Throttled'));

    await expect(startProcessing(ID)).rejects.toThrow('Throttled');
  });
});

describe('updates of an existing job', () => {
  beforeEach(() => {
    dynamoMock.on(UpdateCommand).resolves({});
  });

  function lastUpdateInput(): unknown {
    return dynamoMock.commandCalls(UpdateCommand)[0]?.args[0].input;
  }

  it('setTotals stores the counts and starts progress at 0', async () => {
    await setTotals(ID, { pageCount: 120, totalBlocks: 30 });

    expect(lastUpdateInput()).toEqual({
      TableName: TABLE,
      Key: { id: ID },
      UpdateExpression:
        'SET #pageCount = :pageCount, #totalBlocks = :totalBlocks, #processedBlocks = :processedBlocks, #updatedAt = :updatedAt',
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeNames: {
        '#pageCount': 'pageCount',
        '#totalBlocks': 'totalBlocks',
        '#processedBlocks': 'processedBlocks',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':pageCount': 120,
        ':totalBlocks': 30,
        ':processedBlocks': 0,
        ':updatedAt': NOW,
      },
    });
  });

  it('updateProgress stores processedBlocks', async () => {
    await updateProgress(ID, 7);

    expect(lastUpdateInput()).toEqual({
      TableName: TABLE,
      Key: { id: ID },
      UpdateExpression:
        'SET #processedBlocks = :processedBlocks, #updatedAt = :updatedAt',
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeNames: {
        '#processedBlocks': 'processedBlocks',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: { ':processedBlocks': 7, ':updatedAt': NOW },
    });
  });

  it('completeJob stores COMPLETED with the summary and tokens', async () => {
    await completeJob(ID, {
      findingsCount: 12,
      relevantPages: [3, 14],
      resultsKey: `results/${ID}.json`,
      failedPages: [41, 42],
      inputTokens: 1000,
      outputTokens: 200,
    });

    expect(lastUpdateInput()).toMatchObject({
      TableName: TABLE,
      Key: { id: ID },
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'COMPLETED',
        ':findingsCount': 12,
        ':relevantPages': [3, 14],
        ':resultsKey': `results/${ID}.json`,
        ':failedPages': [41, 42],
        ':inputTokens': 1000,
        ':outputTokens': 200,
        ':completedAt': NOW,
        ':updatedAt': NOW,
      },
    });
  });

  it('failJob stores FAILED with the Spanish message', async () => {
    await failJob(ID, 'El PDF no contiene texto');

    expect(lastUpdateInput()).toEqual({
      TableName: TABLE,
      Key: { id: ID },
      UpdateExpression:
        'SET #status = :status, #errorMessage = :errorMessage, #completedAt = :completedAt, #updatedAt = :updatedAt',
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#errorMessage': 'errorMessage',
        '#completedAt': 'completedAt',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':status': 'FAILED',
        ':errorMessage': 'El PDF no contiene texto',
        ':completedAt': NOW,
        ':updatedAt': NOW,
      },
    });
  });
});

describe('listJobs', () => {
  const LAST_KEY = { id: ID, entityType: 'JOB', createdAt: NOW };

  it('queries the GSI newest first, 20 at a time', async () => {
    dynamoMock.on(QueryCommand).resolves({ Items: [] });

    await listJobs();

    expect(dynamoMock.commandCalls(QueryCommand)[0]?.args[0].input).toEqual({
      TableName: TABLE,
      IndexName: 'by-created-at',
      KeyConditionExpression: 'entityType = :entityType',
      ExpressionAttributeValues: { ':entityType': 'JOB' },
      ScanIndexForward: false,
      Limit: 20,
      ExclusiveStartKey: undefined,
    });
  });

  it('returns the jobs without entityType and the next cursor', async () => {
    dynamoMock.on(QueryCommand).resolves({
      Items: [{ ...STORED_JOB, entityType: 'JOB' }],
      LastEvaluatedKey: LAST_KEY,
    });

    const page = await listJobs();

    expect(page.jobs).toEqual([STORED_JOB]);
    expect(page.nextCursor).toBe(encodeCursor(LAST_KEY));
  });

  it('returns nextCursor null on the last page', async () => {
    dynamoMock.on(QueryCommand).resolves({ Items: [] });

    expect((await listJobs()).nextCursor).toBeNull();
  });

  it('passes the decoded cursor as ExclusiveStartKey', async () => {
    dynamoMock.on(QueryCommand).resolves({ Items: [] });

    await listJobs(encodeCursor(LAST_KEY));

    const input = dynamoMock.commandCalls(QueryCommand)[0]?.args[0].input;
    expect(input?.ExclusiveStartKey).toEqual(LAST_KEY);
  });

  it('throws InvalidCursorError for a garbage cursor without calling DynamoDB', async () => {
    await expect(listJobs('not-a-cursor')).rejects.toThrow(InvalidCursorError);
    expect(dynamoMock.commandCalls(QueryCommand)).toHaveLength(0);
  });
});

describe('cursor encoding', () => {
  const KEY = { id: ID, entityType: 'JOB', createdAt: NOW };

  it('round-trips LastEvaluatedKey → cursor → ExclusiveStartKey', () => {
    expect(decodeCursor(encodeCursor(KEY))).toEqual(KEY);
  });

  it('uses base64url characters only, so it is safe in a URL', () => {
    expect(encodeCursor(KEY)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['not base64 JSON', 'not-a-cursor'],
    ['a JSON array', Buffer.from('[1,2]').toString('base64url')],
    ['null', Buffer.from('null').toString('base64url')],
    [
      'missing keys',
      Buffer.from(JSON.stringify({ id: ID })).toString('base64url'),
    ],
    [
      'extra keys',
      Buffer.from(JSON.stringify({ ...KEY, other: 'x' })).toString('base64url'),
    ],
    [
      'a non-string value',
      Buffer.from(JSON.stringify({ ...KEY, createdAt: 5 })).toString(
        'base64url',
      ),
    ],
  ])('rejects %s', (_label, cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(InvalidCursorError);
  });
});
