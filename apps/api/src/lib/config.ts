// Configuration of the Lambdas: environment variables and SSM secrets.
// The variables and their defaults are listed in docs/architecture.md → "Configuration".
//
// Secrets (the app password and the DeepSeek API key) live only in SSM Parameter
// Store as SecureString (NFR-SEC-02). NEVER log a secret value (NFR-OBS-03):
// log the parameter name instead.

import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
export const DEFAULT_MAX_CONCURRENCY = 5;
export const DEFAULT_APP_PASSWORD_PARAM = '/gaceta-analyzer/app-password';
export const DEFAULT_DEEPSEEK_API_KEY_PARAM =
  '/gaceta-analyzer/deepseek-api-key';

/** Thrown when a required environment variable is missing or empty. */
export class MissingEnvError extends Error {
  constructor(name: string) {
    super(`Missing required environment variable: ${name}`);
    this.name = 'MissingEnvError';
  }
}

/** Returns the value of an environment variable, or throws if it is not set. */
export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new MissingEnvError(name);
  }
  return value;
}

/** Returns the value of an environment variable, or `defaultValue` if it is not set. */
function getOptionalEnv(name: string, defaultValue: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }
  return value;
}

/** DynamoDB table of the jobs. */
export function getTableName(): string {
  return getRequiredEnv('TABLE_NAME');
}

/** S3 bucket for the uploaded PDFs and the results. */
export function getDataBucketName(): string {
  return getRequiredEnv('DATA_BUCKET_NAME');
}

/** SSM parameter name (not the value) of the app password. */
export function getAppPasswordParam(): string {
  return getOptionalEnv('APP_PASSWORD_PARAM', DEFAULT_APP_PASSWORD_PARAM);
}

/** SSM parameter name (not the value) of the DeepSeek API key. */
export function getDeepSeekApiKeyParam(): string {
  return getOptionalEnv(
    'DEEPSEEK_API_KEY_PARAM',
    DEFAULT_DEEPSEEK_API_KEY_PARAM,
  );
}

export function getDeepSeekModel(): string {
  return getOptionalEnv('DEEPSEEK_MODEL', DEFAULT_DEEPSEEK_MODEL);
}

/** How many blocks are sent to the AI at the same time. */
export function getMaxConcurrency(): number {
  const text = getOptionalEnv(
    'MAX_CONCURRENCY',
    String(DEFAULT_MAX_CONCURRENCY),
  );
  const value = Number(text);

  // A typo in Terraform (for example "five" or "0") should fail loudly at
  // startup instead of silently running with no concurrency.
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `MAX_CONCURRENCY must be a whole number of at least 1, got "${text}"`,
    );
  }
  return value;
}

// Created once per Lambda container and reused by every invocation, so the
// connection to SSM is not opened again on each request. Tests replace it with
// aws-sdk-client-mock, which intercepts every SSMClient.
const ssmClient = new SSMClient({});

// Secret values, kept in memory for the lifetime of the Lambda container
// (ADR-0006), so SSM is read once instead of on every request.
//
// The map stores the pending promise, not the value. If two requests ask for the
// same parameter at the same time, the second one waits for the first read
// instead of starting another one.
const parameterCache = new Map<string, Promise<string>>();

/**
 * Reads a SecureString parameter from SSM, decrypted, and caches it.
 * The returned value is a secret: never log it.
 */
export function getSecureParameter(name: string): Promise<string> {
  const cached = parameterCache.get(name);
  if (cached !== undefined) {
    return cached;
  }

  const pending = readParameter(name);
  parameterCache.set(name, pending);

  // A failed read must not stay in the cache, or the container would keep
  // failing until it is recycled. The next call will try SSM again.
  pending.catch(() => {
    parameterCache.delete(name);
  });

  return pending;
}

async function readParameter(name: string): Promise<string> {
  const output = await ssmClient.send(
    new GetParameterCommand({ Name: name, WithDecryption: true }),
  );

  const value = output.Parameter?.Value;
  if (value === undefined || value === '') {
    // Only the name: the value is a secret.
    throw new Error(`SSM parameter has no value: ${name}`);
  }
  return value;
}

/** Empties the secret cache. Only for tests, so each test starts clean. */
export function clearParameterCacheForTests(): void {
  parameterCache.clear();
}
