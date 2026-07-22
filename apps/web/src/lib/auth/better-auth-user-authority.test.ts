import { beforeAll, describe, expect, it, vi } from 'vitest';
import { getTestInstance } from 'better-auth/test';

vi.mock('./member-number-session-hook', () => ({ runMemberNumberSessionHook: vi.fn() }));
vi.mock('./member-number-user-create-hook', () => ({ runMemberNumberUserCreateHook: vi.fn() }));

import { authRequestAuthority } from './auth-request-authority';
import { databaseHooks } from './hooks';
import { userSchemaConfig } from './schema';

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

async function createHarness() {
  return getTestInstance(
    {
      baseURL: 'http://ida.localhost:3000',
      hooks: { before: authRequestAuthority },
      databaseHooks,
      user: memoryUserSchema,
    },
    { disableTestUser: true }
  );
}

let auth: Awaited<ReturnType<typeof createHarness>>['auth'];

function call(path: string, body: object, cookie?: string) {
  return auth.handler(
    new Request(`http://ida.localhost:3000/api/auth/${path}`, {
      method: 'POST',
      headers: {
        host: 'ida.localhost:3000',
        origin: 'http://ida.localhost:3000',
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    })
  );
}

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map(value => value.split(';', 1)[0])
    .join('; ');
}

function fresh(cookie: string) {
  return auth.api.getSession({
    headers: new Headers({ cookie }),
    query: { disableCookieCache: true, disableRefresh: true },
  });
}

describe('real Better Auth authority boundary', () => {
  beforeAll(async () => {
    ({ auth } = await createHarness());
  });

  it('C02/C04/C06 canonicalizes create, rejects update atomically, and permits profile data', async () => {
    const signUp = await call('sign-up/email', {
      email: 'authority@example.com',
      password: 'password123',
      name: 'Original',
      onboarding: { tenant: 'tenant_ks', mode: 'deferred' },
      role: 'super_admin',
      tenantId: 'tenant_mk',
      branchId: 'mk_branch',
      memberNumber: 'ATTACKER',
      tenantClassificationPending: false,
      agentId: 'agent-attacker',
      referralCode: 'OWNED',
    });
    expect(signUp.status, await signUp.clone().text()).toBe(200);
    const created = (await signUp.json()) as { user: Record<string, unknown> };
    expect(created.user).toMatchObject({
      role: 'member',
      tenantId: 'tenant_ks',
      branchId: null,
      memberNumber: null,
      tenantClassificationPending: true,
      agentId: null,
      referralCode: null,
    });
    const cookie = cookies(signUp);
    const before = await fresh(cookie);

    const denied = await call('update-user', { name: 'Poisoned', role: 'super_admin' }, cookie);
    expect(denied.status).toBe(400);
    expect(await denied.json()).toMatchObject({ code: 'AUTHORITY_FIELD_NOT_WRITABLE' });
    expect(denied.headers.getSetCookie().some(value => value.includes('session_token'))).toBe(
      false
    );
    const afterDenied = await fresh(cookie);
    expect(afterDenied?.user).toEqual(before?.user);

    expect(
      (await call('update-user', { name: 'Changed', image: 'https://example.test/a.png' }, cookie))
        .status
    ).toBe(200);
    const afterSafe = await fresh(cookie);
    expect(afterSafe?.user).toMatchObject({
      name: 'Changed',
      role: 'member',
      tenantId: 'tenant_ks',
    });
  });

  it('C03 denies signup without server-resolvable onboarding context and emits no cookie', async () => {
    const response = await call('sign-up/email', {
      email: 'missing@example.com',
      password: 'password123',
      name: 'Missing',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'INVALID_ONBOARDING_CONTEXT' });
    expect(response.headers.getSetCookie().some(value => value.includes('session_token'))).toBe(
      false
    );
  });
});
