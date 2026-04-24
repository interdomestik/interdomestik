import { afterEach, describe, expect, it } from 'vitest';

import { GET as getAuthDebug } from './auth/route';
import { GET as getEnvDebug } from './env/route';

describe('debug API routes', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  function withEnv(env: NodeJS.ProcessEnv) {
    process.env = { ...originalEnv, ...env };
  }

  it('returns 404 for env diagnostics in production deployment', async () => {
    withEnv({ NODE_ENV: 'production' });
    delete process.env.CI;
    delete process.env.PLAYWRIGHT;
    delete process.env.INTERDOMESTIK_AUTOMATED;

    const response = await getEnvDebug();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
  });

  it('returns 404 for auth diagnostics in production deployment', async () => {
    withEnv({ NODE_ENV: 'production' });
    delete process.env.CI;
    delete process.env.PLAYWRIGHT;
    delete process.env.INTERDOMESTIK_AUTOMATED;

    const response = await getAuthDebug();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
  });

  it('keeps diagnostics available for automated gates', async () => {
    withEnv({
      NODE_ENV: 'production',
      INTERDOMESTIK_AUTOMATED: '1',
      INTERDOMESTIK_LOCAL_E2E: '1',
      INTERDOMESTIK_E2E_DIAGNOSTICS: '1',
      PLAYWRIGHT: '1',
    });

    const response = await getEnvDebug();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ INTERDOMESTIK_AUTOMATED: '1' })
    );
  });
});
