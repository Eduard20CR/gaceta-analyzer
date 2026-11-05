import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_APP_PASSWORD_PARAM,
  DEFAULT_DEEPSEEK_API_KEY_PARAM,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_MAX_CONCURRENCY,
  MissingEnvError,
  clearParameterCacheForTests,
  getAppPasswordParam,
  getDataBucketName,
  getDeepSeekApiKeyParam,
  getDeepSeekModel,
  getMaxConcurrency,
  getRequiredEnv,
  getSecureParameter,
  getTableName,
} from '../src/lib/config';

// No test calls AWS: aws-sdk-client-mock intercepts every SSMClient.
const ssmMock = mockClient(SSMClient);

const ENV_NAMES = [
  'TABLE_NAME',
  'DATA_BUCKET_NAME',
  'APP_PASSWORD_PARAM',
  'DEEPSEEK_API_KEY_PARAM',
  'DEEPSEEK_MODEL',
  'MAX_CONCURRENCY',
];

beforeEach(() => {
  ssmMock.reset();
  clearParameterCacheForTests();
  // Start every test with none of our variables set.
  for (const name of ENV_NAMES) {
    vi.stubEnv(name, undefined);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getRequiredEnv', () => {
  it('returns the value when the variable is set', () => {
    vi.stubEnv('TABLE_NAME', 'jobs');
    expect(getRequiredEnv('TABLE_NAME')).toBe('jobs');
  });

  it('throws an error that names the missing variable', () => {
    expect(() => getRequiredEnv('TABLE_NAME')).toThrow(MissingEnvError);
    expect(() => getRequiredEnv('TABLE_NAME')).toThrow(/TABLE_NAME/);
  });

  it('treats an empty value as missing', () => {
    vi.stubEnv('DATA_BUCKET_NAME', '  ');
    expect(() => getDataBucketName()).toThrow(/DATA_BUCKET_NAME/);
  });
});

describe('typed getters', () => {
  it('read the required table and bucket names', () => {
    vi.stubEnv('TABLE_NAME', 'gaceta-jobs');
    vi.stubEnv('DATA_BUCKET_NAME', 'gaceta-data');
    expect(getTableName()).toBe('gaceta-jobs');
    expect(getDataBucketName()).toBe('gaceta-data');
  });

  it('use the defaults from docs/architecture.md when not set', () => {
    expect(getAppPasswordParam()).toBe('/gaceta-analyzer/app-password');
    expect(getDeepSeekApiKeyParam()).toBe('/gaceta-analyzer/deepseek-api-key');
    expect(getDeepSeekModel()).toBe('deepseek-v4-flash');
    expect(getMaxConcurrency()).toBe(5);

    expect(DEFAULT_APP_PASSWORD_PARAM).toBe('/gaceta-analyzer/app-password');
    expect(DEFAULT_DEEPSEEK_API_KEY_PARAM).toBe(
      '/gaceta-analyzer/deepseek-api-key',
    );
    expect(DEFAULT_DEEPSEEK_MODEL).toBe('deepseek-v4-flash');
    expect(DEFAULT_MAX_CONCURRENCY).toBe(5);
  });

  it('use the environment value when set', () => {
    vi.stubEnv('APP_PASSWORD_PARAM', '/other/password');
    vi.stubEnv('DEEPSEEK_API_KEY_PARAM', '/other/key');
    vi.stubEnv('DEEPSEEK_MODEL', 'deepseek-v4-pro');
    vi.stubEnv('MAX_CONCURRENCY', '8');
    expect(getAppPasswordParam()).toBe('/other/password');
    expect(getDeepSeekApiKeyParam()).toBe('/other/key');
    expect(getDeepSeekModel()).toBe('deepseek-v4-pro');
    expect(getMaxConcurrency()).toBe(8);
  });

  it.each(['0', '-1', '2.5', 'five'])(
    'reject MAX_CONCURRENCY "%s"',
    (value) => {
      vi.stubEnv('MAX_CONCURRENCY', value);
      expect(() => getMaxConcurrency()).toThrow(/MAX_CONCURRENCY/);
    },
  );
});

describe('getSecureParameter', () => {
  it('reads the parameter decrypted', async () => {
    ssmMock
      .on(GetParameterCommand)
      .resolves({ Parameter: { Value: 's3cret' } });

    await expect(
      getSecureParameter('/gaceta-analyzer/app-password'),
    ).resolves.toBe('s3cret');
    expect(ssmMock.commandCalls(GetParameterCommand)[0]?.args[0].input).toEqual(
      {
        Name: '/gaceta-analyzer/app-password',
        WithDecryption: true,
      },
    );
  });

  it('calls SSM once for repeated reads of the same parameter', async () => {
    ssmMock
      .on(GetParameterCommand)
      .resolves({ Parameter: { Value: 's3cret' } });

    await getSecureParameter('/p');
    await getSecureParameter('/p');
    await getSecureParameter('/p');

    expect(ssmMock.commandCalls(GetParameterCommand)).toHaveLength(1);
  });

  it('shares one SSM call between concurrent first reads', async () => {
    ssmMock
      .on(GetParameterCommand)
      .resolves({ Parameter: { Value: 's3cret' } });

    const values = await Promise.all([
      getSecureParameter('/p'),
      getSecureParameter('/p'),
    ]);

    expect(values).toEqual(['s3cret', 's3cret']);
    expect(ssmMock.commandCalls(GetParameterCommand)).toHaveLength(1);
  });

  it('caches each parameter separately', async () => {
    ssmMock
      .on(GetParameterCommand, { Name: '/a' })
      .resolves({ Parameter: { Value: 'value-a' } })
      .on(GetParameterCommand, { Name: '/b' })
      .resolves({ Parameter: { Value: 'value-b' } });

    expect(await getSecureParameter('/a')).toBe('value-a');
    expect(await getSecureParameter('/b')).toBe('value-b');
    expect(ssmMock.commandCalls(GetParameterCommand)).toHaveLength(2);
  });

  it('does not cache a failed read, so the next call tries again', async () => {
    ssmMock
      .on(GetParameterCommand)
      .rejectsOnce(new Error('Throttled'))
      .resolves({ Parameter: { Value: 's3cret' } });

    await expect(getSecureParameter('/p')).rejects.toThrow('Throttled');
    await expect(getSecureParameter('/p')).resolves.toBe('s3cret');
    expect(ssmMock.commandCalls(GetParameterCommand)).toHaveLength(2);
  });

  it('fails when the parameter has no value, naming only the parameter', async () => {
    ssmMock.on(GetParameterCommand).resolves({ Parameter: {} });

    await expect(getSecureParameter('/p')).rejects.toThrow(
      'SSM parameter has no value: /p',
    );
  });

  it('never logs the secret value', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    ssmMock
      .on(GetParameterCommand)
      .resolves({ Parameter: { Value: 's3cret' } });

    await getSecureParameter('/p');

    const written = [...log.mock.calls, ...logError.mock.calls]
      .flat()
      .join(' ');
    expect(written).not.toContain('s3cret');
    log.mockRestore();
    logError.mockRestore();
  });
});
