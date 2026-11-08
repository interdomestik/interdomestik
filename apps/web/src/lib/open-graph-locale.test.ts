import { describe, expect, it } from 'vitest';

import { toOpenGraphLocale } from './open-graph-locale';

describe('toOpenGraphLocale', () => {
  it.each([
    ['de', 'de_DE'],
    ['sq', 'sq_AL'],
    ['en', 'en_US'],
    ['hr', 'en_US'],
  ])('labels %s pages as %s', (locale, ogLocale) => {
    expect(toOpenGraphLocale(locale)).toBe(ogLocale);
  });
});
