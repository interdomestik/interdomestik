import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@interdomestik/database', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve([])),
      })),
    })),
  },
}));

vi.mock('@interdomestik/database/schema/auth', () => ({
  user: {
    id: 'id',
  },
}));

describe('performHealthCheck', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env.COMMIT_SHA;
    delete process.env.GITHUB_SHA;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.SOURCE_COMMIT;
    delete process.env.INTERDOMESTIK_DEPLOY_ENV;
    delete process.env.VERCEL_ENV;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('includes build metadata for release provenance checks', async () => {
    process.env.COMMIT_SHA = 'abc123';
    process.env.INTERDOMESTIK_DEPLOY_ENV = 'staging';

    const { performHealthCheck } = await import('./health.service');

    const result = await performHealthCheck();

    expect(result.status).toBe('healthy');
    expect(result.build).toEqual({
      commitSha: 'abc123',
      deployEnv: 'staging',
    });
  });

  it('rejects unsafe Redis REST URLs without performing fetch', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'http://127.0.0.1:6379';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { performHealthCheck } = await import('./health.service');

    const result = await performHealthCheck();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe('degraded');
    expect(result.services.redis?.status).toBe('unhealthy');
    expect(result.services.redis?.error).toMatch(/Invalid Upstash Redis REST URL/i);
  });
});
