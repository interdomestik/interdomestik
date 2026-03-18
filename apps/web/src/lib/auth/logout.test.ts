import { describe, expect, it, vi } from 'vitest';

import { redirectToLocalizedLogin } from './logout';

describe('redirectToLocalizedLogin', () => {
  it('replaces browser location with the localized login route', () => {
    const replace = vi.fn();

    redirectToLocalizedLogin('sq', replace);

    expect(replace).toHaveBeenCalledWith('/sq/login');
  });

  it('falls back to the default locale login for unsupported locales', () => {
    const replace = vi.fn();

    redirectToLocalizedLogin('de', replace);

    expect(replace).toHaveBeenCalledWith('/sq/login');
  });
});
