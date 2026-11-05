import { describe, expect, it } from 'vitest';

import {
  PASSWORD_STORAGE_KEY,
  clearPassword,
  getPassword,
  setPassword,
} from '../../src/api/auth-storage';

describe('auth storage', () => {
  it('returns null when no password was saved', () => {
    expect(getPassword()).toBeNull();
  });

  it('saves the password in localStorage and reads it back', () => {
    setPassword('la-clave');

    expect(getPassword()).toBe('la-clave');
    expect(localStorage.getItem(PASSWORD_STORAGE_KEY)).toBe('la-clave');
  });

  it('clears the saved password', () => {
    setPassword('la-clave');

    clearPassword();

    expect(getPassword()).toBeNull();
  });
});
