import { describe, expect, it, vi } from 'vitest';

vi.mock('./_core.entry', () => ({
  __esModule: true,
  default: () => null,
  generateMetadata: vi.fn(),
  generateViewport: vi.fn(),
  generateStaticParams: vi.fn(() => [
    { locale: 'sq' },
    { locale: 'en' },
    { locale: 'sr' },
    { locale: 'mk' },
  ]),
}));

import * as PricingPageModule from './page';

describe('Pricing page routing mode', () => {
  it('does not force the pricing route to be dynamic', () => {
    expect(PricingPageModule).not.toHaveProperty('dynamic');
    expect(PricingPageModule).not.toHaveProperty('revalidate');
  });

  it('re-exports locale static params for prerendering', () => {
    expect(PricingPageModule.generateStaticParams()).toEqual([
      { locale: 'sq' },
      { locale: 'en' },
      { locale: 'sr' },
      { locale: 'mk' },
    ]);
  });
});
