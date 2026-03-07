import { describe, expect, it, vi } from 'vitest';

vi.mock('./_core.entry', () => ({
  __esModule: true,
  default: () => null,
  generateMetadata: vi.fn(),
  generateViewport: vi.fn(),
}));

import * as LocaleLayoutModule from './layout';

describe('Locale layout routing mode', () => {
  it('does not force the locale layout to be dynamic', () => {
    expect(LocaleLayoutModule).not.toHaveProperty('dynamic');
    expect(LocaleLayoutModule).not.toHaveProperty('revalidate');
  });

  it('re-exports generateViewport from the locale entry', () => {
    expect(LocaleLayoutModule).toHaveProperty('generateViewport');
  });
});
