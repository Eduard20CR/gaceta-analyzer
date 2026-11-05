import { describe, expect, it } from 'vitest';

import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampPage,
  clampZoom,
  formatZoom,
} from '../../src/lib/pdf-pages';

describe('clampPage', () => {
  it.each([
    [5, 10, 5],
    [0, 10, 1],
    [-3, 10, 1],
    [11, 10, 10],
    [3.7, 10, 3],
    [Number.NaN, 10, 1],
    [4, 0, 1],
  ])('clampPage(%d, %d) is %d', (page, pageCount, expected) => {
    expect(clampPage(page, pageCount)).toBe(expected);
  });
});

describe('clampZoom', () => {
  it('keeps the zoom between the limits', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    expect(clampZoom(1.5)).toBe(1.5);
  });
});

describe('formatZoom', () => {
  it('shows a percentage', () => {
    expect(formatZoom(1.25)).toBe('125 %');
  });
});
