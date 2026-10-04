import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { evaluateEmailSignInTenantGuard } from './_core';
import {
  resolveNeutralEmailSignInHost,
  type NeutralSignInHostDecision,
  type NeutralSignInHostEnv,
} from './neutral-email-sign-in-admission';
import {
  clearAmbientEnv,
  CREDENTIALS,
  MATCHING_TENANT_COOKIE,
  MEMBER_EMAIL,
  MISSING_CONTEXT_DENIAL,
  restoreManagedEnv,
  setProductionBuildEnv,
  SIGN_IN_URL,
  snapshotManagedEnv,
  tenantMismatchDenial,
  type AccountTenantId,
} from './_core.neutral-email-sign-in.fixtures';

const originalEnv = new Map<string, string | undefined>();

beforeEach(() => {
  snapshotManagedEnv(originalEnv);
  clearAmbientEnv();
});

afterEach(() => restoreManagedEnv(originalEnv));

function decision(
  headers: Record<string, string>,
  env: NeutralSignInHostEnv = {}
): NeutralSignInHostDecision {
  return resolveNeutralEmailSignInHost(new Headers(headers), env);
}

function admitted(headers: Record<string, string>, env: NeutralSignInHostEnv = {}): boolean {
  return decision(headers, env) === 'admitted';
}

function guard(args: { headers: Record<string, string>; accountTenantId: AccountTenantId }) {
  const lookupUserTenantByEmail = vi.fn(async () => args.accountTenantId);
  const result = evaluateEmailSignInTenantGuard({
    url: SIGN_IN_URL,
    headers: new Headers(args.headers),
    body: CREDENTIALS,
    lookupUserTenantByEmail,
  });

  return { result, lookupUserTenantByEmail };
}

describe('neutral single-entry sign-in host rejection', () => {
  it.each<{ name: string; headers: Record<string, string> }>([
    { name: 'an unknown host', headers: { host: 'evil.example' } },
    { name: 'a look-alike host', headers: { host: 'www.interdomestik.com.evil.example' } },
  ])(
    'leaves $name on its established unknown-host behaviour without neutral admission',
    async ({ headers }) => {
      setProductionBuildEnv();

      const { result } = guard({ headers, accountTenantId: 'tenant_mk' });

      await expect(result).resolves.toEqual(tenantMismatchDenial('tenant_ks'));
    }
  );

  // Each of these is recognizable as a neutral-entry candidate but is not an exact admitted entry,
  // so the decision is terminal. The account tenant deliberately matches the cookie here: a
  // fall-through to the loose legacy host resolver would authenticate the request.
  it.each<{ name: string; headers: Record<string, string> }>([
    {
      name: 'a canonical host with an added port',
      headers: { host: 'www.interdomestik.com:8443' },
    },
    {
      name: 'a spoofed forwarded host',
      headers: { host: 'evil.example', 'x-forwarded-host': 'www.interdomestik.com' },
    },
    {
      name: 'an ambiguous forwarded host',
      headers: { host: 'www.interdomestik.com', 'x-forwarded-host': 'evil.example' },
    },
    { name: 'a comma-joined host value', headers: { host: 'www.interdomestik.com, evil.example' } },
    {
      name: 'a comma-joined forwarded host on an admitted direct host',
      headers: {
        host: 'ida.interdomestik.com',
        'x-forwarded-host': 'ida.interdomestik.com, evil.example',
      },
    },
    { name: 'a missing direct host', headers: { 'x-forwarded-host': 'www.interdomestik.com' } },
    { name: 'broad ida.* recognition', headers: { host: 'ida.evil.example' } },
    { name: 'an ida.* look-alike suffix host', headers: { host: 'ida.interdomestik.com.evil' } },
    { name: 'a scheme-wrapped canonical host', headers: { host: 'https://www.interdomestik.com' } },
    { name: 'a userinfo-prefixed canonical host', headers: { host: 'user@www.interdomestik.com' } },
  ])(
    'terminates $name instead of falling through to a matching tenant cookie',
    async ({ headers }) => {
      const { result, lookupUserTenantByEmail } = guard({
        headers: { cookie: MATCHING_TENANT_COOKIE, ...headers },
        accountTenantId: 'tenant_mk',
      });

      await expect(result).resolves.toEqual(MISSING_CONTEXT_DENIAL);
      expect(lookupUserTenantByEmail).not.toHaveBeenCalled();
    }
  );

  it('terminates a rejected neutral candidate carrying a matching explicit hint', async () => {
    const { result, lookupUserTenantByEmail } = guard({
      headers: { host: 'ida.evil.example', 'x-tenant-id': 'tenant_mk' },
      accountTenantId: 'tenant_mk',
    });

    await expect(result).resolves.toEqual(MISSING_CONTEXT_DENIAL);
    expect(lookupUserTenantByEmail).not.toHaveBeenCalled();
  });

  it('keeps the loopback legacy tenant fallback outside the neutral decision', async () => {
    const { result, lookupUserTenantByEmail } = guard({
      headers: { host: 'localhost:3000', cookie: MATCHING_TENANT_COOKIE },
      accountTenantId: 'tenant_mk',
    });

    await expect(result).resolves.toEqual({ decision: 'allow' });
    expect(lookupUserTenantByEmail).toHaveBeenCalledExactlyOnceWith(MEMBER_EMAIL);
  });
});

// The guard behaviour above rests on this three-state host decision. Candidate recognition consults
// the loose shared front-door helper, which reads ambient configured hosts directly; the suite-level
// env lifecycle clears them so each decision is deterministic.
describe('neutral email sign-in host decision', () => {
  it.each<Record<string, string>>([
    { host: 'interdomestik.com' },
    { host: 'www.interdomestik.com' },
    { host: 'app.interdomestik.com' },
    { host: 'ida.interdomestik.com' },
    { host: 'staging.interdomestik.com' },
    { host: 'interdomestik-web.vercel.app' },
    { host: 'ida.localhost:3000' },
    { host: 'ida.127.0.0.1.nip.io:3000' },
    { host: 'www.interdomestik.com', 'x-forwarded-host': 'www.interdomestik.com' },
  ])('reports the exact neutral entry %o as admitted', headers => {
    expect(decision(headers)).toBe('admitted');
  });

  it('reports an exact configured neutral entry as admitted', () => {
    expect(
      decision({ host: 'front-door.localhost:3000' }, { IDA_HOST: 'front-door.localhost:3000' })
    ).toBe('admitted');
  });

  it.each<{ name: string; headers: Record<string, string> }>([
    {
      name: 'a canonical host with an added port',
      headers: { host: 'www.interdomestik.com:8443' },
    },
    {
      name: 'a comma-spliced canonical host',
      headers: { host: 'www.interdomestik.com, evil.example' },
    },
    {
      name: 'a scheme-wrapped canonical host',
      headers: { host: 'https://www.interdomestik.com' },
    },
    {
      name: 'a path-suffixed canonical host',
      headers: { host: 'www.interdomestik.com/login' },
    },
    {
      name: 'a userinfo-prefixed canonical host',
      headers: { host: 'user@www.interdomestik.com' },
    },
    {
      name: 'a backslash-spliced canonical host',
      headers: { host: 'www.interdomestik.com\\evil.example' },
    },
    {
      name: 'a disagreeing forwarded host',
      headers: { host: 'www.interdomestik.com', 'x-forwarded-host': 'evil.example' },
    },
    {
      name: 'a comma-joined forwarded host on an admitted direct host',
      headers: {
        host: 'ida.interdomestik.com',
        'x-forwarded-host': 'ida.interdomestik.com, evil.example',
      },
    },
    {
      name: 'an empty forwarded host',
      headers: { host: 'www.interdomestik.com', 'x-forwarded-host': '' },
    },
    {
      name: 'a missing direct host behind a forwarded neutral claim',
      headers: { 'x-forwarded-host': 'www.interdomestik.com' },
    },
    {
      name: 'a spoofed forwarded neutral claim on an unknown direct host',
      headers: { host: 'evil.example', 'x-forwarded-host': 'ida.interdomestik.com' },
    },
    { name: 'loose ida.* recognition', headers: { host: 'ida.anything' } },
    { name: 'a hostile ida.* host', headers: { host: 'ida.evil.example' } },
    {
      name: 'an ida.* look-alike suffix host',
      headers: { host: 'ida.interdomestik.com.evil.example' },
    },
  ])('reports $name as a rejected neutral candidate', ({ headers }) => {
    expect(decision(headers)).toBe('rejected_neutral_candidate');
    expect(admitted(headers)).toBe(false);
  });

  it('reports a configured neutral hostname on the wrong port as a rejected candidate', () => {
    expect(
      decision({ host: 'front-door.localhost:3001' }, { IDA_HOST: 'front-door.localhost:3000' })
    ).toBe('rejected_neutral_candidate');
  });

  it.each<{ name: string; headers: Record<string, string> }>([
    { name: 'a country alias host', headers: { host: 'ks.interdomestik.com' } },
    { name: 'a local country alias host', headers: { host: 'mk.localhost:3000' } },
    { name: 'a pilot alias host', headers: { host: 'pilot.127.0.0.1.nip.io:3000' } },
    {
      name: 'a country alias host behind a forwarded neutral claim',
      headers: { host: 'ks.localhost:3000', 'x-forwarded-host': 'ida.interdomestik.com' },
    },
    { name: 'a loopback host', headers: { host: 'localhost:3000' } },
    { name: 'a loopback IP host', headers: { host: '127.0.0.1:3000' } },
    { name: 'an unrelated unknown host', headers: { host: 'evil.example' } },
    {
      name: 'a canonical look-alike suffix host',
      headers: { host: 'www.interdomestik.com.evil.example' },
    },
    {
      name: 'a canonical look-alike without a separator',
      headers: { host: 'idainterdomestik.com' },
    },
    { name: 'a request without any host headers', headers: {} },
  ])('leaves $name outside the neutral entry decision', ({ headers }) => {
    expect(decision(headers)).toBe('not_a_neutral_candidate');
    expect(admitted(headers)).toBe(false);
  });
});
