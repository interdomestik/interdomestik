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
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('VERCEL_URL', '');
    vi.stubEnv('BETTER_AUTH_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.resetModules();

    const { authConfig: productionAuthConfig } = await import('./config');

    expect(productionAuthConfig.baseURL).toBe('https://www.interdomestik.com');
  });

  it('allows known Vercel preview auth hosts with a canonical fallback', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_URL', 'interdomestik-3ig3hb7jl-ecohub.vercel.app');
    vi.stubEnv('BETTER_AUTH_URL', 'https://staging.interdomestik.com');
    vi.resetModules();

    const { authConfig: vercelAuthConfig } = await import('./config');

    expect(vercelAuthConfig.baseURL).toEqual({
      allowedHosts: expect.arrayContaining([
        'www.interdomestik.com',
        'ida.interdomestik.com',
        'staging.interdomestik.com',
        'interdomestik-*-ecohub.vercel.app',
      ]),
      fallback: 'https://staging.interdomestik.com',
      protocol: 'https',
    });
  });
});
