import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestInstance } from 'better-auth/test';

vi.mock('./member-number-session-hook', () => ({ runMemberNumberSessionHook: vi.fn() }));
vi.mock('./member-number-user-create-hook', () => ({ runMemberNumberUserCreateHook: vi.fn() }));

import { authRequestAuthority } from './auth-request-authority';
import { databaseHooks } from './hooks';
import { userSchemaConfig } from './schema';

const profile = { id: 'gh', name: 'GitHub', email: 'gh@example.com', emailVerified: true };
const memoryUserSchema = {
  ...userSchemaConfig,
  additionalFields: {
    ...userSchemaConfig.additionalFields,
    branchId: { ...userSchemaConfig.additionalFields.branchId, required: false as const },
    memberNumber: { ...userSchemaConfig.additionalFields.memberNumber, required: false as const },
    agentId: { ...userSchemaConfig.additionalFields.agentId, required: false as const },
    referralCode: { ...userSchemaConfig.additionalFields.referralCode, required: false as const },
  },
};

async function harness() {
  const instance = await getTestInstance(
    {
      baseURL: 'http://ida.localhost:3000',
      hooks: { before: authRequestAuthority },
      databaseHooks,
      user: memoryUserSchema,
      socialProviders: {
        github: {
          clientId: 'test',
          clientSecret: 'test',
          getUserInfo: async () => ({ user: profile, data: profile }),
        },
      },
    },
    { disableTestUser: true }
  );
  return instance.auth;
}

type Auth = Awaited<ReturnType<typeof harness>>;

function cookie(response: Response) {
  return response.headers
    .getSetCookie()
    .map(value => value.split(';', 1)[0])
    .join('; ');
}

function hasSessionCookie(response: Response) {
  return response.headers.getSetCookie().some(value => value.includes('session_token'));
}

async function initiate(auth: Auth, additionalData?: object) {
  const response = await auth.handler(
    new Request('http://ida.localhost:3000/api/auth/sign-in/social', {
      method: 'POST',
      headers: {
        host: 'ida.localhost:3000',
        origin: 'http://ida.localhost:3000',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'github',
        callbackURL: '/done',
        disableRedirect: true,
        additionalData,
      }),
    })
  );
  const data = (await response.json()) as { url: string };
  return { state: new URL(data.url).searchParams.get('state')!, cookie: cookie(response) };
}

async function callback(auth: Auth, state: string, stateCookie: string) {
  return auth.handler(
    new Request(`http://ida.localhost:3000/api/auth/callback/github?code=ok&state=${state}`, {
      headers: { host: 'ida.localhost:3000', cookie: stateCookie },
      redirect: 'manual',
    })
  );
}

function fresh(auth: Auth, response: Response) {
  return auth.api.getSession({
    headers: new Headers({ cookie: cookie(response) }),
    query: { disableCookieCache: true, disableRefresh: true },
  });
}

describe('deterministic database-state GitHub authority', () => {
  beforeEach(() =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ access_token: 'token' }))
    )
  );

  it('C08/C09 creates canonically, rejects tamper and replay, without provider network', async () => {
    const auth = await harness();
    const start = await initiate(auth, {
      onboarding: { tenant: 'tenant_ks', mode: 'deferred' },
      role: 'super_admin',
      expiresAt: 0,
    });
    const missingCookie = await callback(auth, start.state, '');
    expect(missingCookie.status).toBe(302);
    expect(hasSessionCookie(missingCookie)).toBe(false);
    const tampered = await callback(auth, `${start.state}x`, start.cookie);
    expect(tampered.status).toBe(302);
    expect(hasSessionCookie(tampered)).toBe(false);

    const success = await callback(auth, start.state, start.cookie);
    expect(
      success.status,
      `${success.headers.get('location')} ${await success.clone().text()}`
    ).toBe(302);
    expect(success.headers.get('location')).toBe('/done');
    expect((await fresh(auth, success))?.user).toMatchObject({
      role: 'member',
      tenantId: 'tenant_ks',
      branchId: null,
    });

    const replay = await callback(auth, start.state, start.cookie);
    expect(replay.status).toBe(302);
    expect(hasSessionCookie(replay)).toBe(false);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('C10 signs in an existing social user without rewriting authority', async () => {
    const auth = await harness();
    const first = await initiate(auth, { onboarding: { tenant: 'tenant_ks', mode: 'deferred' } });
    await callback(auth, first.state, first.cookie);
    const second = await initiate(auth, { onboarding: { tenant: 'tenant_mk', mode: 'deferred' } });
    const signedIn = await callback(auth, second.state, second.cookie);
    expect((await fresh(auth, signedIn))?.user).toMatchObject({
      role: 'member',
      tenantId: 'tenant_ks',
      branchId: null,
    });
  });
});
