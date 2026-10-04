import { describe, expect, it } from 'vitest';

import {
  resolveNeutralEmailSignInHost,
  type NeutralSignInHostEnv,
} from './neutral-email-sign-in-admission';

const NO_CONFIGURED_HOSTS: NeutralSignInHostEnv = {};

// The three-state decision (admitted / rejected candidate / not a candidate) is asserted in
// _core.neutral-email-sign-in-hosts.test.ts alongside its terminal guard behaviour.
function admitted(
  headers: Record<string, string>,
  env: NeutralSignInHostEnv = NO_CONFIGURED_HOSTS
): boolean {
  return resolveNeutralEmailSignInHost(new Headers(headers), env) === 'admitted';
}

describe('neutral email sign-in host admission', () => {
  it.each([
    'interdomestik.com',
    'www.interdomestik.com',
    'app.interdomestik.com',
    'ida.interdomestik.com',
    'staging.interdomestik.com',
    'interdomestik-web.vercel.app',
  ])('admits the exact canonical neutral host %s', host => {
    expect(admitted({ host })).toBe(true);
  });

  it.each(['ida.localhost:3000', 'ida.127.0.0.1.nip.io:3000', 'ida.localhost'])(
    'admits the exact local neutral entry %s with its configured port',
    host => {
      expect(admitted({ host })).toBe(true);
    }
  );

  it.each([
    'www.interdomestik.com:8443',
    'ida.interdomestik.com:3000',
    'interdomestik-web.vercel.app:443',
  ])('does not admit a canonical neutral host with an added port (%s)', host => {
    expect(admitted({ host })).toBe(false);
  });

  it.each([
    'ida.anything',
    'ida.evil.example',
    'ida.interdomestik.com.evil.example',
    'idainterdomestik.com',
    'evil.example',
    'www.interdomestik.com.evil.example',
  ])('does not admit unrecognized or look-alike host %s', host => {
    expect(admitted({ host })).toBe(false);
  });

  it.each([
    'ks.interdomestik.com',
    'mk.interdomestik.com',
    'al.interdomestik.com',
    'pilot.interdomestik.com',
    'ks.localhost:3000',
    'pilot.127.0.0.1.nip.io:3000',
  ])('does not admit the country/pilot compatibility alias %s', host => {
    expect(admitted({ host })).toBe(false);
  });

  it('does not admit a request without a direct host header', () => {
    expect(admitted({ 'x-forwarded-host': 'www.interdomestik.com' })).toBe(false);
    expect(admitted({})).toBe(false);
  });

  it.each([
    'www.interdomestik.com, evil.example',
    'https://www.interdomestik.com',
    'www.interdomestik.com/login',
    'user@www.interdomestik.com',
    'www.interdomestik.com\\evil.example',
    'www.interdomestik.com:0',
    'www.interdomestik.com:99999',
    ' ',
  ])('does not admit the malformed or ambiguous host value %o', host => {
    expect(admitted({ host })).toBe(false);
  });

  it('admits an agreeing forwarded host, including a port-equal value', () => {
    expect(
      admitted({ host: 'www.interdomestik.com', 'x-forwarded-host': 'www.interdomestik.com' })
    ).toBe(true);
    expect(admitted({ host: 'ida.localhost:3000', 'x-forwarded-host': 'ida.localhost:3000' })).toBe(
      true
    );
  });

  it.each([
    { host: 'www.interdomestik.com', 'x-forwarded-host': 'ks.interdomestik.com' },
    { host: 'www.interdomestik.com', 'x-forwarded-host': 'evil.example' },
    { host: 'www.interdomestik.com', 'x-forwarded-host': 'www.interdomestik.com:8443' },
    { host: 'www.interdomestik.com', 'x-forwarded-host': 'www.interdomestik.com, evil.example' },
    { host: 'www.interdomestik.com', 'x-forwarded-host': '' },
    { host: 'ida.localhost:3000', 'x-forwarded-host': 'ida.localhost' },
  ])('does not admit a disagreeing or ambiguous forwarded host %o', headers => {
    expect(admitted(headers)).toBe(false);
  });

  it('does not admit a spoofed forwarded host on an unknown direct host', () => {
    expect(admitted({ host: 'evil.example', 'x-forwarded-host': 'ida.interdomestik.com' })).toBe(
      false
    );
  });

  it.each<NeutralSignInHostEnv>([
    { IDA_HOST: 'front-door.localhost:3000' },
    { IDA_HOST: 'https://front-door.localhost:3000' },
    { VERCEL_URL: 'front-door.localhost:3000' },
    { BETTER_AUTH_URL: 'https://front-door.localhost:3000' },
    { NEXT_PUBLIC_APP_URL: 'https://front-door.localhost:3000' },
  ])('admits the exact configured neutral entry %o', env => {
    expect(admitted({ host: 'front-door.localhost:3000' }, env)).toBe(true);
  });

  it('requires an exact configured authority rather than a derived or wildcard match', () => {
    const env: NeutralSignInHostEnv = { IDA_HOST: 'front-door.localhost:3000' };

    expect(admitted({ host: 'front-door.localhost' }, env)).toBe(false);
    expect(admitted({ host: 'front-door.localhost:3001' }, env)).toBe(false);
    expect(admitted({ host: 'evil.front-door.localhost:3000' }, env)).toBe(false);
    expect(
      admitted(
        { host: 'interdomestik-pr-1-ecohub.vercel.app' },
        { VERCEL_URL: 'interdomestik-*-ecohub.vercel.app' }
      )
    ).toBe(false);
    expect(admitted({ host: 'anything.vercel.app' }, { VERCEL_URL: '*.vercel.app' })).toBe(false);
  });

  it.each([
    'https://front-door.localhost:3000/login',
    'https://front-door.localhost:3000?next=/en/member',
    'https://user:pass@front-door.localhost:3000',
    'front-door.localhost:3000, evil.example',
  ])('ignores the unusable configured value %o', value => {
    expect(admitted({ host: 'front-door.localhost:3000' }, { IDA_HOST: value })).toBe(false);
  });

  it('never admits a compatibility alias through a configured host value', () => {
    expect(admitted({ host: 'ks.interdomestik.com' }, { IDA_HOST: 'ks.interdomestik.com' })).toBe(
      false
    );
  });
});
