import { beforeEach, describe, expect, it, vi } from 'vitest';

const entry = vi.hoisted(() => ({ generateMetadata: vi.fn() }));

vi.mock('./_core.entry', () => entry);

import { generateMetadata } from './locale-metadata';

describe('locale layout metadata', () => {
  beforeEach(() => {
    entry.generateMetadata.mockResolvedValue({
      title: { default: 'Interdomestik', template: '%s | Interdomestik' },
      openGraph: { type: 'website', locale: 'en_US', siteName: 'Interdomestik' },
    });
  });

  it.each([
    ['de', 'de_DE'],
    ['sq', 'sq_AL'],
    ['en', 'en_US'],
    ['mk', 'en_US'],
  ])('labels %s pages with the %s OpenGraph locale', async (locale, ogLocale) => {
    const props = { params: Promise.resolve({ locale }) };

    await expect(generateMetadata(props)).resolves.toEqual({
      title: { default: 'Interdomestik', template: '%s | Interdomestik' },
      openGraph: { type: 'website', locale: ogLocale, siteName: 'Interdomestik' },
    });
    expect(entry.generateMetadata).toHaveBeenCalledWith(props);
  });
});
