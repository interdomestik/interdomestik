import { describe, expect, it } from 'vitest';
import {
  assertDeploymentOriginMatchesBuild,
  captureDeploymentOriginSnapshot,
  resolveDeploymentOrigin,
  validateDeploymentOriginSnapshot,
  type DeploymentOriginEnv,
} from './deployment-origin.mjs';

const LOCAL = 'http://127.0.0.1:3000';
const STAGING = 'https://staging.interdomestik.com';
const PRODUCTION = 'https://ida.interdomestik.com';
const local = { NEXT_PUBLIC_APP_URL: LOCAL, BETTER_AUTH_URL: LOCAL, NODE_ENV: 'production' };
const preview = {
  VERCEL_ENV: 'preview',
  NEXT_PUBLIC_APP_URL: STAGING,
  BETTER_AUTH_URL: STAGING,
  IDA_HOST: 'staging.interdomestik.com',
};

describe('existing deployment lanes without new configuration', () => {
  it.each(['ci.yml', 'e2e-pr', 'pilot-gate', 'nightly', 'release-candidate', 'multi-agent'])(
    '%s builds and starts on its existing loopback door',
    () => {
      const snapshot = captureDeploymentOriginSnapshot(local);
      expect(snapshot).toEqual({ environment: 'local', origin: LOCAL });
      // Playwright also supplies its independent routing host; it cannot select the door.
      expect(
        assertDeploymentOriginMatchesBuild(
          { ...local, IDA_HOST: 'ida.127.0.0.1.nip.io:3000' },
          snapshot
        )
      ).toEqual(snapshot);
    }
  );

  it.each([
    ['Docker loopback build', local, { environment: 'local', origin: LOCAL }],
    [
      'od17 canary',
      { NEXT_PUBLIC_APP_URL: 'https://build.invalid', BETTER_AUTH_URL: 'https://build.invalid' },
      {},
    ],
    // cd.yml -> action supplies app-url, but Dockerfile has no ARG/ENV to forward it.
    ['CD staging image (actual builder inputs)', { INTERDOMESTIK_DEPLOY_ENV: 'staging' }, {}],
    ['bare Docker build', {}, {}],
    [
      'CD staging URL without VERCEL_ENV or IDA_HOST',
      { NEXT_PUBLIC_APP_URL: STAGING },
      { environment: 'staging', origin: STAGING },
    ],
    ['Vercel preview build', preview, { environment: 'staging', origin: STAGING }],
    [
      'Vercel production before cutover',
      { VERCEL_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://www.interdomestik.com' },
      {},
    ],
  ] satisfies [string, DeploymentOriginEnv, object][])(
    '%s cannot be blocked by snapshot capture',
    (_lane, env, expected) => {
      expect(captureDeploymentOriginSnapshot(env)).toEqual(expected);
    }
  );

  it('Vercel preview runtime requires the staging door, auth agreement and IDA_HOST', () => {
    expect(resolveDeploymentOrigin(preview)).toEqual({ environment: 'staging', origin: STAGING });
    for (const key of ['NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL', 'IDA_HOST']) {
      expect(() => resolveDeploymentOrigin({ ...preview, [key]: undefined })).toThrow();
    }
    expect(() => resolveDeploymentOrigin({ ...preview, KS_HOST: preview.IDA_HOST })).toThrow();
  });

  it('non-Vercel staging URL is staging and requires full configuration only at runtime', () => {
    const env = { NEXT_PUBLIC_APP_URL: STAGING, BETTER_AUTH_URL: STAGING };
    const snapshot = captureDeploymentOriginSnapshot(env);
    expect(snapshot).toEqual({ environment: 'staging', origin: STAGING });
    expect(() => resolveDeploymentOrigin(env)).toThrow('IDA_HOST');
    expect(
      assertDeploymentOriginMatchesBuild({ ...env, IDA_HOST: preview.IDA_HOST }, snapshot)
    ).toEqual(snapshot);
  });

  it('Vercel production runtime refuses destinations until the owner cutover agrees', () => {
    const env = {
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_APP_URL: PRODUCTION,
      BETTER_AUTH_URL: PRODUCTION,
    };
    expect(resolveDeploymentOrigin(env)).toEqual({ environment: 'production', origin: PRODUCTION });
    for (const key of ['NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL', 'NEXT_PUBLIC_SITE_URL']) {
      expect(() =>
        resolveDeploymentOrigin({ ...env, [key]: 'https://www.interdomestik.com' })
      ).toThrow();
    }
  });

  it('an unavailable snapshot grants no client destination but does not reject a valid server', () => {
    expect(() => validateDeploymentOriginSnapshot({})).toThrow();
    expect(assertDeploymentOriginMatchesBuild(preview, {})).toEqual({
      environment: 'staging',
      origin: STAGING,
    });
    expect(() =>
      assertDeploymentOriginMatchesBuild(preview, { environment: 'local', origin: LOCAL })
    ).toThrow('build_runtime_mismatch');
  });

  it('keeps placeholder and mismatched local URLs refused as actual destinations', () => {
    for (const origin of [
      'https://build.invalid',
      'https://www.interdomestik.com',
      'http://192.168.1.2:3000',
    ]) {
      expect(() =>
        resolveDeploymentOrigin({ NEXT_PUBLIC_APP_URL: origin, BETTER_AUTH_URL: origin })
      ).toThrow('local_door');
    }
    for (const key of ['BETTER_AUTH_URL', 'NEXT_PUBLIC_SITE_URL']) {
      expect(() => resolveDeploymentOrigin({ ...local, [key]: 'http://localhost:3000' })).toThrow(
        key
      );
    }
  });
});
