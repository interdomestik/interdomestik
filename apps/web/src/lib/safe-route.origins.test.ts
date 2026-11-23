// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { sessionRouteOrigins } from './safe-route.origins';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('VERCEL', undefined);
  vi.stubEnv('VERCEL_URL', undefined);
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000/api/auth');
  vi.stubEnv('BETTER_AUTH_TRUSTED_ORIGINS', undefined);
  vi.stubEnv('INTERDOMESTIK_AUTOMATED', undefined);
  vi.stubEnv('PLAYWRIGHT', undefined);
});

afterEach(() => vi.unstubAllEnvs());

it('serializes local base and trusted origins and ignores malformed entries', () => {
  vi.stubEnv(
    'BETTER_AUTH_TRUSTED_ORIGINS',
    'http://127.0.0.1:3000/, invalid, http://other.test/path, http://other.test\\path'
  );
  expect([...sessionRouteOrigins()]).toEqual(['http://localhost:3000', 'http://127.0.0.1:3000']);
});

it('returns an empty set when the local base and trusted origins are unusable', () => {
  vi.stubEnv('BETTER_AUTH_URL', 'invalid');
  expect(sessionRouteOrigins().size).toBe(0);
});

it.each([
  [
    'preview',
    ['staging.interdomestik.com', 'ks.staging.interdomestik.com', 'mk.staging.interdomestik.com'],
  ],
  ['production', ['ida.interdomestik.com']],
] as const)(
  'includes only hosted %s hosts despite a foreign configured base',
  (environment, hosts) => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', environment);
    vi.stubEnv('VERCEL_TARGET_ENV', environment);
    vi.stubEnv('BETTER_AUTH_URL', 'https://foreign.example.test');
    expect([...sessionRouteOrigins()]).toEqual(hosts.map(host => `https://${host}`));
  }
);

it('refuses malformed hosted trust configuration through the auth check', () => {
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('BETTER_AUTH_TRUSTED_ORIGINS', 'https://ida.interdomestik.com/path');
  expect(sessionRouteOrigins).toThrow('this deployment does not trust');
});
