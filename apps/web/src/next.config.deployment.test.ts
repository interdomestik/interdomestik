import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise next.config itself without starting Next or running plugin build hooks.
vi.mock('@next/bundle-analyzer', () => ({ default: () => (config: unknown) => config }));
vi.mock('next-intl/plugin', () => ({ default: () => (config: unknown) => config }));
vi.mock('next-axiom', () => ({ withAxiom: (config: unknown) => config }));
vi.mock('@sentry/nextjs', () => ({ withSentryConfig: (config: unknown) => config }));

const LOCAL = 'http://127.0.0.1:3000';
const STAGING = 'https://staging.interdomestik.com';
const PRODUCTION = 'https://ida.interdomestik.com';
const loopback = { NEXT_PUBLIC_APP_URL: LOCAL, BETTER_AUTH_URL: LOCAL };
const preview = {
  VERCEL_ENV: 'preview',
  NEXT_PUBLIC_APP_URL: STAGING,
  BETTER_AUTH_URL: STAGING,
  IDA_HOST: 'staging.interdomestik.com',
};

beforeEach(() => {
  vi.resetModules();
  for (const key of [
    'INTERDOMESTIK_DEPLOY_ENV',
    'NEXT_PUBLIC_APP_URL',
    'BETTER_AUTH_URL',
    'NEXT_PUBLIC_SITE_URL',
    'IDA_HOST',
    'KS_HOST',
    'MK_HOST',
    'AL_HOST',
    'PILOT_HOST',
    'VERCEL_ENV',
    'VERCEL_TARGET_ENV',
    'CSP_NONCE_MODE',
    'SENTRY_VALIDATE_SOURCEMAPS',
  ])
    vi.stubEnv(key, undefined);
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://staging-ref.supabase.co');
  vi.stubEnv('SUPABASE_PRODUCTION_PROJECT_REF', 'prod-ref');
});
afterEach(() => vi.unstubAllEnvs());

describe('next.config compatibility with existing lanes', () => {
  it.each([
    ...['ci.yml', 'e2e-pr', 'pilot-gate', 'nightly', 'release-candidate', 'multi-agent'].map(
      lane => [lane, loopback, 'local', LOCAL] as const
    ),
    ['Docker loopback', loopback, 'local', LOCAL],
    [
      'od17 canary',
      { NEXT_PUBLIC_APP_URL: 'https://build.invalid', BETTER_AUTH_URL: 'https://build.invalid' },
      '',
      '',
    ],
    ['CD staging image actual Docker inputs', { INTERDOMESTIK_DEPLOY_ENV: 'staging' }, '', ''],
    ['bare Docker build', {}, '', ''],
    [
      'non-Vercel staging URL without runtime auth/IDA',
      { NEXT_PUBLIC_APP_URL: STAGING },
      'staging',
      STAGING,
    ],
    ['Vercel preview', preview, 'staging', STAGING],
    [
      'Vercel production before owner cutover',
      {
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_APP_URL: 'https://www.interdomestik.com',
        BETTER_AUTH_URL: 'https://www.interdomestik.com',
      },
      '',
      '',
    ],
    [
      'Vercel production canonical',
      { VERCEL_ENV: 'production', NEXT_PUBLIC_APP_URL: PRODUCTION, BETTER_AUTH_URL: PRODUCTION },
      'production',
      PRODUCTION,
    ],
  ] satisfies ReadonlyArray<readonly [string, Readonly<Record<string, string>>, string, string]>)(
    '%s loads configuration without a new required environment input',
    async (_lane, env, environment, origin) => {
      const variables: Readonly<Record<string, string>> = env;
      for (const [key, value] of Object.entries(variables)) vi.stubEnv(key, value);
      if (variables.VERCEL_ENV === 'production') {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://prod-ref.supabase.co');
      }
      const { default: config } = await import('../next.config.mjs');
      expect(config.env).toMatchObject({
        INTERDOMESTIK_BUILT_DEPLOY_ENV: environment,
        INTERDOMESTIK_BUILT_DEPLOY_ORIGIN: origin,
      });
    }
  );
});
