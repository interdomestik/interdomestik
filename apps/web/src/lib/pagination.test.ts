import { describe, expect, it } from 'vitest';
import { clampPage, clampPerPage, MAX_PER_PAGE } from './pagination';

describe('page clamp', () => {
  it.each([
    [Number.NaN, 1],
    [0, 1],
    [-3, 1],
    [2.7, 2],
    [7, 7],
  ])('clamps page %s to %s', (value, expected) => {
    expect(clampPage(value)).toBe(expected);
  });

  it.each([
    [Number.NaN, 10],
    [0, 10],
    [12.9, 12],
    [MAX_PER_PAGE + 1, MAX_PER_PAGE],
    [100_000, MAX_PER_PAGE],
  ])('clamps page size %s to %s', (value, expected) => {
    expect(clampPerPage(value, 10)).toBe(expected);
  });
});
