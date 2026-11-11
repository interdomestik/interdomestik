import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubDeploymentOrigin } from './lib/deployment-origin.test-support';

vi.mock('@sentry/nextjs', () => ({ captureRequestError: vi.fn() }));
vi.mock('./sentry.server.config', () => ({}));
vi.mock('./sentry.edge.config', () => ({}));
beforeEach(() => {
  vi.resetModules();
  stubDeploymentOrigin();
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
  vi.stubEnv('NEXT_PHASE', undefined);
  vi.stubEnv('INTERDOMESTIK_BUILT_CSP_NONCE_MODE', 'off');
  vi.stubEnv('CSP_NONCE_MODE', 'off');
  vi.spyOn(process, 'on').mockReturnValue(process);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('deployment origin startup validation', () => {
  it('accepts matching runtime and compiled configuration', async () => {
    const { register } = await import('./instrumentation');
    expect(() => register()).not.toThrow();
  });

  it('refuses a stale artifact at startup', async () => {
    const { register } = await import('./instrumentation');
    vi.stubEnv('NEXT_RUNTIME', undefined);
    vi.stubEnv('INTERDOMESTIK_BUILT_DEPLOY_ORIGIN', 'https://ida.interdomestik.com');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => register()).toThrow();
    expect(log).toHaveBeenCalledOnce();
  });

  it.each(['https://build.invalid', undefined])(
    'does not validate build-only inputs %s at startup',
    async origin => {
      vi.stubEnv('NEXT_PHASE', 'phase-production-build');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', origin);
      const { register } = await import('./instrumentation');
      expect(() => register()).not.toThrow();
    }
  );

  it.each(['production_door', 'BETTER_AUTH_URL', 'build_runtime_mismatch'])(
    'production starts with one structured error for %s and refuses destinations',
    async failure => {
      stubDeploymentOrigin('production', 'https://ida.interdomestik.com');
      if (failure === 'production_door')
        vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.interdomestik.com');
      if (failure === 'BETTER_AUTH_URL')
        vi.stubEnv('BETTER_AUTH_URL', 'https://www.interdomestik.com');
      if (failure === 'build_runtime_mismatch') {
        vi.stubEnv('INTERDOMESTIK_BUILT_DEPLOY_ENV', 'local');
        vi.stubEnv('INTERDOMESTIK_BUILT_DEPLOY_ORIGIN', 'http://localhost:3000');
      }
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('unexpected exit');
      });
      const { register } = await import('./instrumentation');
      const { getServerDeploymentOrigin } = await import('./lib/deployment-origin.server');
      expect(() => register()).not.toThrow();
      expect(() => register()).not.toThrow();
      expect(log).toHaveBeenCalledExactlyOnceWith({
        event: 'deployment_origin_invalid',
        environment: 'production',
        error: expect.stringContaining(failure),
      });
      expect(exit).not.toHaveBeenCalled();
      expect(() => getServerDeploymentOrigin()).toThrow(failure);
    }
  );

  it('keeps rendering-mode mismatch fatal in production', async () => {
    stubDeploymentOrigin('production', 'https://ida.interdomestik.com');
    vi.stubEnv('NEXT_RUNTIME', undefined);
    vi.stubEnv('CSP_NONCE_MODE', 'report');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { register } = await import('./instrumentation');
    expect(() => register()).toThrow('CSP_NONCE_MODE');
  });
});
