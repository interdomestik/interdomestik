import { describe, expect, it, vi } from 'vitest';

import { redirectToLocalizedLogin, signOutAndRedirectToLogin } from './logout';

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

describe('signOutAndRedirectToLogin', () => {
  it('redirects after sign-out succeeds', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    const replace = vi.fn();

    await signOutAndRedirectToLogin({ locale: 'mk', signOut, replaceLocation: replace });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/mk/login');
  });

  it('redirects after an abort-like sign-out fetch failure', async () => {
    const signOut = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const replace = vi.fn();

    await signOutAndRedirectToLogin({ locale: 'mk', signOut, replaceLocation: replace });

    expect(replace).toHaveBeenCalledWith('/mk/login');
  });

  it('rethrows unexpected sign-out failures', async () => {
    const signOut = vi.fn().mockRejectedValue(new Error('server exploded'));
    const replace = vi.fn();

    await expect(
      signOutAndRedirectToLogin({ locale: 'mk', signOut, replaceLocation: replace })
    ).rejects.toThrow('server exploded');
    expect(replace).not.toHaveBeenCalled();
  });
});
