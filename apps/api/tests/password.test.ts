import * as crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { extractBearerToken, passwordsMatch } from '../src/lib/password';

// Wraps node:crypto so a test can check that timingSafeEqual is really used.
vi.mock('node:crypto', async (importOriginal) => {
  const original = await importOriginal<typeof crypto>();
  return { ...original, timingSafeEqual: vi.fn(original.timingSafeEqual) };
});

describe('extractBearerToken', () => {
  it('returns the token of a Bearer header', () => {
    expect(extractBearerToken('Bearer secreto')).toBe('secreto');
  });

  it('accepts any case for "Bearer" and trims spaces', () => {
    expect(extractBearerToken('  bEaReR   secreto  ')).toBe('secreto');
  });

  it('keeps spaces inside the token', () => {
    expect(extractBearerToken('Bearer mi clave')).toBe('mi clave');
  });

  it.each([
    ['a missing header', undefined],
    ['an empty header', ''],
    ['an empty token', 'Bearer   '],
    ['the scheme alone', 'Bearer'],
    ['another scheme', 'Basic dXNlcjpwYXNz'],
    ['a token without scheme', 'secreto'],
  ])('returns null for %s', (_label, header) => {
    expect(extractBearerToken(header)).toBeNull();
  });
});

describe('passwordsMatch', () => {
  it('is true for equal passwords', () => {
    expect(passwordsMatch('correcta', 'correcta')).toBe(true);
  });

  it('is false for different passwords of the same length', () => {
    expect(passwordsMatch('correctb', 'correcta')).toBe(false);
  });

  it('does not throw and is false for passwords of different length', () => {
    expect(() =>
      passwordsMatch('a', 'una-clave-mucho-mas-larga'),
    ).not.toThrow();
    expect(passwordsMatch('a', 'una-clave-mucho-mas-larga')).toBe(false);
    expect(passwordsMatch('', 'correcta')).toBe(false);
  });

  it('compares with crypto.timingSafeEqual', () => {
    vi.mocked(crypto.timingSafeEqual).mockClear();

    passwordsMatch('uno', 'dos');

    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(1);
  });
});
