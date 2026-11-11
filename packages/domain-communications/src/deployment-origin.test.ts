import { describe, expect, it } from 'vitest';
import {
  assertDeploymentOriginMatchesBuild,
  resolveDeploymentOrigin,
  validateDeploymentOriginSnapshot,
} from './deployment-origin.mjs';

const PROD = 'https://ida.interdomestik.com';
const STAGING = 'https://staging.interdomestik.com';

function config(environment = 'staging', origin = STAGING): Record<string, string> {
  return {
    ...(environment === 'local'
      ? {}
      : { VERCEL_ENV: environment === 'staging' ? 'preview' : 'production' }),
    NEXT_PUBLIC_APP_URL: origin,
    BETTER_AUTH_URL: `${origin}/api/auth`,
    IDA_HOST: new URL(origin).host,
    NODE_ENV: 'production',
  };
}

describe('deployment origin', () => {
  it.each([
    ['production', PROD],
    ['staging', STAGING],
    ['local', 'http://ida.localhost:3310'],
    ['local', 'http://ida.localhost:443'],
    ['local', 'https://ida.127.0.0.1.nip.io:80'],
    ['local', 'https://ida.127.0.0.1.nip.io:3443'],
    ['local', 'http://localhost:3000'],
    ['local', 'http://127.0.0.1:3000'],
  ])('derives %s even with NODE_ENV=production: %s', (environment, origin) => {
    expect(resolveDeploymentOrigin(config(environment, origin))).toEqual({ environment, origin });
  });

  it('accepts agreeing public URLs and the existing auth suffix', () => {
    const env = { ...config(), NEXT_PUBLIC_SITE_URL: `${STAGING}/`, VERCEL_URL: 'ignored.test' };
    expect(resolveDeploymentOrigin(env).origin).toBe(STAGING);
    expect(
      resolveDeploymentOrigin({ ...env, BETTER_AUTH_URL: `${STAGING}/api/auth/` }).origin
    ).toBe(STAGING);
  });

  it.each([
    { VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'staging' },
    { VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview' },
    { VERCEL_TARGET_ENV: 'staging' },
  ])('accepts supported staging signals %j', signals => {
    expect(resolveDeploymentOrigin({ ...config(), ...signals }).origin).toBe(STAGING);
  });

  it.each([
    { VERCEL_TARGET_ENV: 'production' },
    { VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'production' },
    { VERCEL_ENV: 'staging' },
    { VERCEL_TARGET_ENV: 'unknown' },
  ])('rejects contradictory or unsupported staging signals %j', signals => {
    expect(() => resolveDeploymentOrigin({ ...config(), ...signals })).toThrow();
  });

  it('rejects non-production Vercel metadata in production', () => {
    expect(() =>
      resolveDeploymentOrigin({ ...config('production', PROD), VERCEL_ENV: 'preview' })
    ).toThrow();
    expect(() =>
      resolveDeploymentOrigin({
        ...config('local', 'http://ida.localhost:3000'),
        VERCEL_TARGET_ENV: 'staging',
      })
    ).toThrow();
  });

  it.each(['NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL', 'IDA_HOST'])(
    'requires staging configuration %s',
    key => {
      const env = config();
      delete env[key];
      expect(() => resolveDeploymentOrigin(env)).toThrow();
    }
  );

  it.each(['preview', 'development', 'unknown'])('rejects deployment identity %s', environment => {
    expect(() =>
      resolveDeploymentOrigin({ ...config(), INTERDOMESTIK_DEPLOY_ENV: environment })
    ).toThrow();
  });

  it('accepts an optional override, refuses conflicts and treats an empty Docker ARG as absent', () => {
    const env = {
      NEXT_PUBLIC_APP_URL: PROD,
      BETTER_AUTH_URL: PROD,
      INTERDOMESTIK_DEPLOY_ENV: 'production',
    };
    expect(resolveDeploymentOrigin(env)).toEqual({ environment: 'production', origin: PROD });
    expect(() =>
      resolveDeploymentOrigin({ ...config(), INTERDOMESTIK_DEPLOY_ENV: 'local' })
    ).toThrow();
    expect(
      resolveDeploymentOrigin({
        ...config('local', 'http://127.0.0.1:3000'),
        INTERDOMESTIK_DEPLOY_ENV: '',
      }).environment
    ).toBe('local');
  });

  it.each(['NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL', 'NEXT_PUBLIC_SITE_URL'])(
    'rejects production leakage in staging through %s',
    key => {
      expect(() => resolveDeploymentOrigin({ ...config(), [key]: PROD })).toThrow();
    }
  );

  it.each(['https://www.interdomestik.com', STAGING, 'https://ida.interdomestik.com:8443'])(
    'rejects a production door of %s',
    origin => {
      expect(() => resolveDeploymentOrigin(config('production', origin))).toThrow();
    }
  );

  it.each(['http://ks.localhost:3000', 'https://build.invalid', PROD])(
    'rejects nonlocal or alias destination %s in local mode',
    origin => {
      expect(() => resolveDeploymentOrigin(config('local', origin))).toThrow();
    }
  );

  it.each(['KS_HOST', 'MK_HOST', 'AL_HOST', 'PILOT_HOST'])(
    'rejects normalized door collisions via %s',
    key => {
      for (const host of [
        'staging.interdomestik.com',
        'STAGING.INTERDOMESTIK.COM.:8443',
        'ida.interdomestik.com',
        'ida.localhost',
        'ida.127.0.0.1.nip.io:3310',
      ]) {
        expect(() => resolveDeploymentOrigin({ ...config(), [key]: host })).toThrow();
      }
    }
  );

  it('rejects duplicate configured aliases and collisions with built-in aliases', () => {
    expect(() =>
      resolveDeploymentOrigin({
        ...config(),
        KS_HOST: 'alias.test:443',
        MK_HOST: 'ALIAS.TEST.:8443',
      })
    ).toThrow();
    expect(() =>
      resolveDeploymentOrigin({ ...config(), KS_HOST: 'mk.interdomestik.com' })
    ).toThrow();
    expect(
      resolveDeploymentOrigin({ ...config(), KS_HOST: 'ks.test', MK_HOST: 'mk.test' }).origin
    ).toBe(STAGING);
  });

  it.each([
    '//staging.interdomestik.com',
    'javascript:alert(1)',
    'http://staging.interdomestik.com',
    'https://user:secret@staging.interdomestik.com',
    'https://*.interdomestik.com',
    'https://staging.interdomestik.com,evil.test',
    'https://staging.interdomestik.com/path',
    'https://staging.interdomestik.com/?x=1',
    'https://staging.interdomestik.com/#x',
    'https://staging.interdomestik.com/#',
    'https://staging.interdomestik.com/?',
    'https://staging.interdomestik.com/other/..',
    'https://staging.interdomestik.com\\evil',
    'https://staging.interdomestik.com\n',
    'https://staging.interdomestik.com:99999',
  ])('rejects malformed application URL %s', raw => {
    expect(() => resolveDeploymentOrigin({ ...config(), NEXT_PUBLIC_APP_URL: raw })).toThrow();
  });

  it.each([
    'host/path',
    'user@host',
    '*.test',
    'a.test,b.test',
    'https://alias.test',
    'host:99999',
  ])('rejects malformed alias or door host %s', host => {
    expect(() => resolveDeploymentOrigin({ ...config(), KS_HOST: host })).toThrow();
    expect(() => resolveDeploymentOrigin({ ...config(), IDA_HOST: host })).toThrow();
  });

  it('requires build and runtime identity and origin to agree', () => {
    const snapshot = { environment: 'staging', origin: STAGING };
    expect(assertDeploymentOriginMatchesBuild(config(), snapshot)).toEqual(snapshot);
    expect(() =>
      assertDeploymentOriginMatchesBuild(config('production', PROD), snapshot)
    ).toThrow();
    expect(() =>
      assertDeploymentOriginMatchesBuild(config(), { environment: 'staging' })
    ).toThrow();
    expect(() =>
      validateDeploymentOriginSnapshot({ environment: 'staging', origin: PROD })
    ).toThrow();
    expect(() => validateDeploymentOriginSnapshot({})).toThrow();
    expect(() =>
      validateDeploymentOriginSnapshot({ environment: 'staging', origin: `${STAGING}/` })
    ).toThrow();
  });
});
