import { betterAuth } from 'better-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as deploymentHosts from './deployment-hosts';
import {
  filterHostedOrigins,
  hostedAuthEnvironment,
  hostedAuthHosts,
  hostedAuthOrigin,
} from './deployment-hosts';
import { getAuthBaseURL, getTrustedOrigins } from './utils';

const CLEARED = [
  'VERCEL',
  'VERCEL_URL',
  'VERCEL_ENV',
  'VERCEL_TARGET_ENV',
  'INTERDOMESTIK_AUTOMATED',
  'PLAYWRIGHT',
  'BETTER_AUTH_URL',
  'BETTER_AUTH_TRUSTED_ORIGINS',
  'NEXT_PUBLIC_APP_URL',
];

const SECRET = 'sec-11-trusted-host-contract-secret-at-least-32-bytes';

// Everything an attacker could name as the end of a reset link, per environment.
const FOREIGN_TO_PRODUCTION = [
  'https://staging.interdomestik.com/sq/reset-password',
  'https://ks.staging.interdomestik.com/sq/reset-password',
  'https://interdomestik-abc123-ecohub.vercel.app/sq/reset-password',
  'https://interdomestik-web.vercel.app/sq/reset-password',
  'https://www.interdomestik.com/sq/reset-password',
  'https://ks.interdomestik.com/sq/reset-password',
  'https://evil.example.test/sq/reset-password',
  'http://ida.interdomestik.com/sq/reset-password',
];

const FOREIGN_TO_STAGING = [
  'https://ida.interdomestik.com/sq/reset-password',
  'https://www.interdomestik.com/sq/reset-password',
  'https://interdomestik-abc123-ecohub.vercel.app/sq/reset-password',
  'https://evil.example.test/sq/reset-password',
];

async function hostedContext(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return betterAuth({
    baseURL: getAuthBaseURL(),
    trustedOrigins: getTrustedOrigins(),
    secret: SECRET,
  }).$context;
}

describe('per-environment trusted auth hosts (SEC-11)', () => {
  beforeEach(() => {
    for (const key of CLEARED) vi.stubEnv(key, '');
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('names exact hosts only: the one door for production, three staging hosts for staging', () => {
    expect(hostedAuthHosts('production')).toEqual(['ida.interdomestik.com']);
    expect(hostedAuthHosts('staging')).toEqual([
      'staging.interdomestik.com',
      'ks.staging.interdomestik.com',
      'mk.staging.interdomestik.com',
    ]);
    for (const host of [...hostedAuthHosts('production'), ...hostedAuthHosts('staging')]) {
      expect(host).not.toMatch(/[*]|vercel\.app/u);
    }
  });

  it('hands each caller its own copy, so no caller can change the trusted list', () => {
    for (const environment of ['production', 'staging'] as const) {
      const hosts = hostedAuthHosts(environment) as string[];
      hosts.push('attacker.example');
      expect(hostedAuthHosts(environment)).not.toContain('attacker.example');
    }
    expect(hostedAuthHosts('production')).toEqual(['ida.interdomestik.com']);
  });

  it('exports no host list an importer could change', () => {
    for (const [name, value] of Object.entries(deploymentHosts)) {
      expect(Array.isArray(value) || (typeof value === 'object' && value !== null), name).toBe(
        false
      );
    }
  });

  it.each([
    ['production', 'production', ''],
    ['preview', 'staging', ''],
    ['preview', 'staging', 'preview'],
    ['preview', 'production', 'production'],
    ['development', 'production', ''],
    ['', 'production', ''],
  ])(
    'treats VERCEL_ENV=%s as %s (target %s): only a clear preview is staging',
    (env, expected, target) => {
      vi.stubEnv('VERCEL_ENV', env);
      vi.stubEnv('VERCEL_TARGET_ENV', target);
      expect(hostedAuthEnvironment()).toBe(expected);
    }
  );

  it('never issues links from a configured URL that is off the environment list', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('BETTER_AUTH_URL', 'https://staging.interdomestik.com');
    expect(hostedAuthOrigin()).toBe('https://ida.interdomestik.com');
    vi.stubEnv('BETTER_AUTH_URL', 'https://ida.interdomestik.com');
    expect(hostedAuthOrigin()).toBe('https://ida.interdomestik.com');
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(hostedAuthOrigin()).toBe('https://staging.interdomestik.com');
  });

  it('drops configured trusted origins that are off the environment list', () => {
    expect(
      filterHostedOrigins(
        [
          'https://ida.interdomestik.com',
          'https://staging.interdomestik.com',
          'https://interdomestik-x-ecohub.vercel.app',
          'http://ida.interdomestik.com',
          'https://ida.interdomestik.com:8443',
          'not a url',
        ],
        'production'
      )
    ).toEqual(['https://ida.interdomestik.com']);
  });

  it('a production deployment trusts the one door and nothing else', async () => {
    const context = await hostedContext({
      VERCEL: '1',
      VERCEL_ENV: 'production',
      VERCEL_URL: 'interdomestik-abc123-ecohub.vercel.app',
      BETTER_AUTH_URL: 'https://www.interdomestik.com',
      BETTER_AUTH_TRUSTED_ORIGINS: 'https://ida.interdomestik.com/',
    });

    expect(getTrustedOrigins()).toEqual(['https://ida.interdomestik.com']);
    expect(getAuthBaseURL()).toEqual({
      allowedHosts: ['ida.interdomestik.com'],
      fallback: 'https://ida.interdomestik.com',
      protocol: 'https',
    });
    expect(context.isTrustedOrigin('https://ida.interdomestik.com/sq/reset-password')).toBe(true);
    for (const foreign of FOREIGN_TO_PRODUCTION) {
      expect(context.isTrustedOrigin(foreign), foreign).toBe(false);
    }
  });

  it.each([
    ['production', 'https://staging.interdomestik.com'],
    ['production', 'https://interdomestik-abc123-ecohub.vercel.app'],
    ['production', 'https://ida.interdomestik.com,https://evil.example.test'],
    ['production', 'https://ida.interdomestik.com/sq'],
    ['preview', 'https://ida.interdomestik.com'],
  ])(
    'a %s deployment refuses to configure auth when the trusted-origin variable names %s',
    (vercelEnv, configured) => {
      vi.stubEnv('VERCEL', '1');
      vi.stubEnv('VERCEL_ENV', vercelEnv);
      vi.stubEnv('BETTER_AUTH_TRUSTED_ORIGINS', configured);
      expect(() => getTrustedOrigins()).toThrow(/does not trust/u);
    }
  );

  it('names no rejected value in the configuration error', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv(
      'BETTER_AUTH_TRUSTED_ORIGINS',
      'https://ops:hunter2@evil.example.test/?token=abc123,https://staging.interdomestik.com\u0007'
    );
    let message = '';
    try {
      getTrustedOrigins();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe(
      'BETTER_AUTH_TRUSTED_ORIGINS names 2 origin(s) this deployment does not trust'
    );
  });

  it('a staging deployment trusts its own hosts and not production', async () => {
    const context = await hostedContext({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'interdomestik-abc123-ecohub.vercel.app',
      BETTER_AUTH_URL: 'https://staging.interdomestik.com',
    });

    for (const host of hostedAuthHosts('staging')) {
      expect(context.isTrustedOrigin(`https://${host}/sq/reset-password`), host).toBe(true);
    }
    for (const foreign of FOREIGN_TO_STAGING) {
      expect(context.isTrustedOrigin(foreign), foreign).toBe(false);
    }
  });
});
