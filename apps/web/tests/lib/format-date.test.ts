import { describe, expect, it } from 'vitest';

import { formatDateTime } from '../../src/lib/format-date';

describe('formatDateTime', () => {
  it('shows a UTC date in Costa Rica time (UTC-6), in Spanish', () => {
    // 20:18 UTC is 14:18 (2:18 p. m.) in Costa Rica.
    const text = formatDateTime('2026-11-04T20:18:00.000Z');

    expect(text).toContain('4 nov 2026');
    expect(text).toContain('2:18');
  });

  it('moves to the previous day when it is still that day in Costa Rica', () => {
    // 03:00 UTC on the 5th is 21:00 on the 4th in Costa Rica.
    expect(formatDateTime('2026-11-05T03:00:00.000Z')).toContain('4 nov 2026');
  });
});
