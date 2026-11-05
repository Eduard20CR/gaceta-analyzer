import { describe, expect, it } from 'vitest';

import { ApiError, UnauthorizedError } from '../src/api';
import { shouldRetry } from '../src/query-client';

describe('shouldRetry', () => {
  it('retries other failures up to 2 times', () => {
    const error = new ApiError(500, 'Falló');

    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(true);
    expect(shouldRetry(2, error)).toBe(false);
  });

  it('never retries a wrong password', () => {
    expect(shouldRetry(0, new UnauthorizedError())).toBe(false);
  });

  it('never retries a 404: the job will not appear by asking again', () => {
    expect(shouldRetry(0, new ApiError(404, 'El análisis no existe'))).toBe(
      false,
    );
  });
});
