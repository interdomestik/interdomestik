import { afterEach, describe, expect, it, vi } from 'vitest';

import { authConfig } from './config';

describe('authConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('disables better-auth sign-in email custom throttling in favor of the app route limiter', () => {
    expect(authConfig.rateLimit?.customRules?.['/sign-in/email']).toBe(false);
  });

  it('keeps global better-auth rate limiting enabled outside automated environments', () => {
    expect(authConfig.rateLimit?.window).toBe(60);
    expect(authConfig.rateLimit?.max).toBe(100);
  });

  it('does not fall back to localhost for production auth base URL', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BETTER_AUTH_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.resetModules();

    const { authConfig: productionAuthConfig } = await import('./config');

    expect(productionAuthConfig.baseURL).toBe('https://www.interdomestik.com');
  });
});
