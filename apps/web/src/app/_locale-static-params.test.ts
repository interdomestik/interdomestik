import { describe, expect, it } from 'vitest';
import { generateLocaleStaticParams } from './_locale-static-params';

describe('generateLocaleStaticParams', () => {
  it('returns every supported locale for public prerendering', () => {
    expect(generateLocaleStaticParams()).toEqual([
      { locale: 'sq' },
      { locale: 'en' },
      { locale: 'sr' },
      { locale: 'mk' },
    ]);
  });
});
