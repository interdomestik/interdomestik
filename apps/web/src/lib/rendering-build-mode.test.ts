import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { assertRenderingBuildMode } from './rendering-build-mode';

vi.mock('@next/bundle-analyzer', () => ({ default: () => (config: unknown) => config }));
vi.mock('@sentry/nextjs', () => ({
  captureRequestError: vi.fn(),
  withSentryConfig: (config: unknown) => config,
}));
vi.mock('next-axiom', () => ({ withAxiom: (config: unknown) => config }));
vi.mock('next-intl/plugin', () => ({ default: () => (config: unknown) => config }));
vi.mock('./supabase-deployment.mjs', () => ({ validateSupabaseDeploymentSeparation: vi.fn() }));
vi.mock('../sentry.server.config', () => ({}));
vi.mock('../sentry.edge.config', () => ({}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('SENTRY_VALIDATE_SOURCEMAPS', 'false');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('rendering build mode assertion', () => {
  it.each([
    ['off', undefined],
    ['off', 'off'],
    ['report', 'report'],
  ])('accepts built %s with runtime %s', (built, runtime) => {
    expect(() => assertRenderingBuildMode(built, runtime)).not.toThrow();
  });

  it.each([
    ['off', 'report'],
    ['report', 'off'],
    ['report', undefined],
  ])('rejects built %s with runtime %s', (built, runtime) => {
    expect(() => assertRenderingBuildMode(built, runtime)).toThrow('does not match');
  });

  it.each([undefined, '', 'enforce', ' report ', 'Report', 'secret-ish-value'])(
    'rejects an absent or invalid compiled mode without exposing its value',
    built => {
      expect(() => assertRenderingBuildMode(built, 'off')).toThrow('Invalid compiled');
      expect(() => assertRenderingBuildMode(built, 'off')).not.toThrow('secret-ish-value');
    }
  );

  it.each(['', 'enforce', ' report ', 'Report', 'secret-ish-value'])(
    'rejects invalid runtime mode without exposing its value',
    runtime => {
      expect(() => assertRenderingBuildMode('off', runtime)).toThrow('Invalid CSP_NONCE_MODE');
      expect(() => assertRenderingBuildMode('off', runtime)).not.toThrow('secret-ish-value');
    }
  );
});

describe('Next rendering configuration', () => {
  it.each([
    { raw: undefined, mode: 'off', enabled: true },
    { raw: 'off', mode: 'off', enabled: true },
    { raw: 'report', mode: 'report', enabled: false },
  ])('derives the build binding from actual CSP mode $raw', async ({ raw, mode, enabled }) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-08T00:00:00Z'));
    vi.stubEnv('CSP_NONCE_MODE', raw);
    vi.stubEnv('INTERDOMESTIK_BUILT_CSP_NONCE_MODE', 'forged');
    const { default: config } = await import('../../next.config.mjs');

    expect(config.cacheComponents).toBe(enabled);
    expect(config.env).toEqual({
      INTERDOMESTIK_BUILT_CSP_NONCE_MODE: mode,
      INTERDOMESTIK_BUILD_COPYRIGHT_YEAR: '2026',
    });
    expect(config.env).not.toHaveProperty('CSP_NONCE_MODE');
    expect(process.env.CSP_NONCE_MODE).toBe(raw);
    expect(config.output).toBe('standalone');
  });

  it.each([
    ['2026-12-31T23:30:00-02:00', '2027'],
    ['2027-01-01T00:30:00+02:00', '2026'],
  ])('binds the actual UTC build year at %s', async (clock, year) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(clock));
    vi.stubEnv('CSP_NONCE_MODE', 'off');
    vi.stubEnv('INTERDOMESTIK_BUILD_COPYRIGHT_YEAR', 'forged');

    const { default: config } = await import('../../next.config.mjs');

    expect(config.env?.INTERDOMESTIK_BUILD_COPYRIGHT_YEAR).toBe(year);
  });

  it.each(['', 'enforce', ' report ', 'Report', 'secret-ish-value'])(
    'rejects invalid build mode instead of falling back',
    async raw => {
      vi.stubEnv('CSP_NONCE_MODE', raw);
      await expect(import('../../next.config.mjs')).rejects.toThrow('Invalid CSP_NONCE_MODE');
    }
  );
});

describe('instrumentation mode guard', () => {
  it.each(['nodejs', 'edge'])('preserves matching %s initialization', async runtime => {
    vi.stubEnv('NEXT_RUNTIME', runtime);
    vi.stubEnv('INTERDOMESTIK_BUILT_CSP_NONCE_MODE', 'report');
    vi.stubEnv('CSP_NONCE_MODE', 'report');
    const handlers = vi.spyOn(process, 'on').mockReturnValue(process);
    const { register, onRequestError } = await import('../instrumentation');
    const sentry = await import('@sentry/nextjs');

    expect(() => register()).not.toThrow();
    expect(handlers).toHaveBeenCalledTimes(runtime === 'nodejs' ? 2 : 0);
    expect(onRequestError).toBe(sentry.captureRequestError);
  });

  it('terminates a node runtime mismatch before registering handlers', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('INTERDOMESTIK_BUILT_CSP_NONCE_MODE', 'off');
    vi.stubEnv('CSP_NONCE_MODE', 'report');
    const handlers = vi.spyOn(process, 'on');
    const exits = vi.spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`process exited ${String(code)}`);
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { register, onRequestError } = await import('../instrumentation');
    const sentry = await import('@sentry/nextjs');

    expect(() => register()).toThrow('process exited 1');
    expect(exits).toHaveBeenCalledWith(1);
    expect(errors).toHaveBeenCalledWith(
      'CSP_NONCE_MODE does not match the compiled build; use a matching artifact.'
    );
    expect(handlers).not.toHaveBeenCalled();
    expect(onRequestError).toBe(sentry.captureRequestError);
  });

  it('rejects an edge runtime mismatch without using a process lifecycle API', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    vi.stubEnv('INTERDOMESTIK_BUILT_CSP_NONCE_MODE', 'off');
    vi.stubEnv('CSP_NONCE_MODE', 'report');
    const handlers = vi.spyOn(process, 'on');
    const exits = vi.spyOn(process, 'exit');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { register, onRequestError } = await import('../instrumentation');
    const sentry = await import('@sentry/nextjs');

    expect(() => register()).toThrow('does not match');
    expect(exits).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledWith(
      'CSP_NONCE_MODE does not match the compiled build; use a matching artifact.'
    );
    expect(handlers).not.toHaveBeenCalled();
    expect(onRequestError).toBe(sentry.captureRequestError);
  });
});
