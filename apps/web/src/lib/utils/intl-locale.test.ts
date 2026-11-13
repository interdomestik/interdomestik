import { describe, expect, it } from 'vitest';

import { toIntlLocaleTag } from './intl-locale';

describe('toIntlLocaleTag', () => {
  it.each([
    ['de', 'de-DE'],
    ['mk', 'mk-MK'],
    ['sq', 'sq-AL'],
    ['sr', 'sr-Latn-RS'],
    ['en', 'en-US'],
    ['hr', 'en-US'],
    ['constructor', 'en-US'],
  ])('maps %s to %s', (locale, tag) => {
    expect(toIntlLocaleTag(locale)).toBe(tag);
  });

  it('formats German dates and euro amounts in German', () => {
    const date = new Date('2026-11-08T12:00:00.000Z');
    expect(
      new Intl.DateTimeFormat(toIntlLocaleTag('de'), { dateStyle: 'long', timeZone: 'UTC' }).format(
        date
      )
    ).toBe('8. November 2026');
    expect(
      new Intl.NumberFormat(toIntlLocaleTag('de'), { style: 'currency', currency: 'EUR' }).format(
        1234.5
      )
    ).toBe('1.234,50 €');
  });
});
