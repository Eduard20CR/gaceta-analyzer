import {
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobResults } from '@gaceta/shared';

import {
  createPdfReadUrl,
  createUploadPost,
  getPdfBytes,
  getResults,
  jobIdFromUploadKey,
  putResults,
  resultsKey,
  uploadKey,
} from '../src/lib/storage';

// The presigners only compute signatures locally; they are replaced so the tests
// can check exactly what they were asked to sign.
vi.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: vi.fn(),
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

// No test calls AWS: aws-sdk-client-mock intercepts every S3Client.
const s3Mock = mockClient(S3Client);

const BUCKET = 'gaceta-analyzer-data-123';
const ID = '3f6c2a1e-1111-4222-8333-444455556666';

type ObjectBody = NonNullable<GetObjectCommandOutput['Body']>;

/** A fake GetObject body: the SDK's stream type is only needed for these two methods. */
function fakeBody(content: string): ObjectBody {
  const bytes = new TextEncoder().encode(content);
  const body = {
    transformToByteArray: () => Promise.resolve(bytes),
    transformToString: () => Promise.resolve(content),
  };
  // The real type is a Node stream with extra methods; the code only uses these two.
  return body as unknown as ObjectBody;
}

beforeEach(() => {
  s3Mock.reset();
  vi.mocked(createPresignedPost).mockReset();
  vi.mocked(getSignedUrl).mockReset();
  vi.stubEnv('DATA_BUCKET_NAME', BUCKET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('keys', () => {
  it('builds the upload and results keys', () => {
    expect(uploadKey(ID)).toBe(`uploads/${ID}.pdf`);
    expect(resultsKey(ID)).toBe(`results/${ID}.json`);
  });
});

describe('jobIdFromUploadKey', () => {
  it('returns the id of a valid upload key', () => {
    expect(jobIdFromUploadKey(`uploads/${ID}.pdf`)).toBe(ID);
  });

  it('decodes URL-encoded keys from S3 events', () => {
    expect(jobIdFromUploadKey(`uploads%2F${ID}.pdf`)).toBe(ID);
  });

  it.each([
    ['another prefix', `results/${ID}.pdf`],
    ['a nested path', `uploads/x/${ID}.pdf`],
    ['another extension', `uploads/${ID}.json`],
    ['an id that is not a UUID', 'uploads/my file.pdf'],
    ['an encoded space', 'uploads/my+file.pdf'],
    ['a malformed escape', 'uploads/%E0%A4%A.pdf'],
    ['an empty key', ''],
  ])('returns null for %s', (_label, key) => {
    expect(jobIdFromUploadKey(key)).toBeNull();
  });
});

describe('createUploadPost', () => {
  it('only allows a PDF of at most 100 MB, at the exact key, for 15 minutes', async () => {
    vi.mocked(createPresignedPost).mockResolvedValue({
      url: 'https://s3.example/bucket',
      fields: { key: `uploads/${ID}.pdf`, Policy: 'abc' },
    });

    const post = await createUploadPost(ID);

    expect(post).toEqual({
      url: 'https://s3.example/bucket',
      fields: { key: `uploads/${ID}.pdf`, Policy: 'abc' },
    });
    expect(createPresignedPost).toHaveBeenCalledWith(expect.any(S3Client), {
      Bucket: BUCKET,
      Key: `uploads/${ID}.pdf`,
      Conditions: [
        ['eq', '$Content-Type', 'application/pdf'],
        ['content-length-range', 1, 100 * 1024 * 1024],
      ],
      Fields: { 'Content-Type': 'application/pdf' },
      Expires: 900,
    });
  });
});

describe('getPdfBytes', () => {
  it('downloads the object as bytes', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: fakeBody('%PDF-1.7') });

    const bytes = await getPdfBytes(`uploads/${ID}.pdf`);

    expect(new TextDecoder().decode(bytes)).toBe('%PDF-1.7');
    expect(s3Mock.commandCalls(GetObjectCommand)[0]?.args[0].input).toEqual({
      Bucket: BUCKET,
      Key: `uploads/${ID}.pdf`,
    });
  });
});

describe('createPdfReadUrl', () => {
  it('returns a 15-minute presigned GET when the PDF exists', async () => {
    s3Mock.on(HeadObjectCommand).resolves({});
    vi.mocked(getSignedUrl).mockResolvedValue('https://s3.example/signed');

    const url = await createPdfReadUrl(`uploads/${ID}.pdf`);

    expect(url).toBe('https://s3.example/signed');
    const [, command, options] = vi.mocked(getSignedUrl).mock.calls[0] ?? [];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command?.input).toEqual({
      Bucket: BUCKET,
      Key: `uploads/${ID}.pdf`,
    });
    expect(options).toEqual({ expiresIn: 900 });
  });

  it('returns null when the PDF does not exist anymore', async () => {
    s3Mock
      .on(HeadObjectCommand)
      .rejects(new NotFound({ message: 'Not Found', $metadata: {} }));

    expect(await createPdfReadUrl(`uploads/${ID}.pdf`)).toBeNull();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('throws other errors', async () => {
    s3Mock.on(HeadObjectCommand).rejects(new Error('Access Denied'));

    await expect(createPdfReadUrl(`uploads/${ID}.pdf`)).rejects.toThrow(
      'Access Denied',
    );
  });
});

describe('putResults and getResults', () => {
  const RESULTS: JobResults = {
    jobId: ID,
    findings: [
      {
        page: 14,
        topic: 'Aranceles',
        quote: 'Se modifica el arancel…',
        reason: 'Cambia un arancel de importación',
        relevance: 'high',
        verification: 'verified',
      },
    ],
  };

  it('round-trips the results through results/{id}.json', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    await putResults(ID, RESULTS);

    const putInput = s3Mock.commandCalls(PutObjectCommand)[0]?.args[0].input;
    expect(putInput).toMatchObject({
      Bucket: BUCKET,
      Key: `results/${ID}.json`,
      ContentType: 'application/json',
    });

    // Give back exactly what was stored.
    const storedBody = putInput?.Body;
    if (typeof storedBody !== 'string') {
      throw new Error('Expected the results to be stored as a JSON string');
    }
    s3Mock.on(GetObjectCommand).resolves({ Body: fakeBody(storedBody) });

    expect(await getResults(`results/${ID}.json`)).toEqual(RESULTS);
  });
});
