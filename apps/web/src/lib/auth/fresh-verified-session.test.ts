import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFreshVerifiedSession } from './fresh-verified-session';

const provider = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: provider } } }));
const headers = new Headers({
  host: 'ida.localhost',
  cookie: 'tenantId=tenant_ks',
  'x-tenant-id': 'tenant_ks',
});
const user = {
  id: 'owner',
  email: 'owner@example.test',
  emailVerified: true,
  role: 'member',
  tenantId: 'tenant_mk',
};
const denied = { ok: false, code: 'authRequired' };

describe('fresh verified-session provider adapter', () => {
  beforeEach(() => {
    provider.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(['tenant_ks', 'tenant_mk', 'pilot-mk'])(
    'reads fresh %s identity with both cache/refresh disabled',
    async tenantId => {
      vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', 'tenant_ks');
      provider.mockResolvedValue({ user: { ...user, tenantId } });
      expect(await readFreshVerifiedSession(headers)).toEqual({
        ok: true,
        session: {
          userId: 'owner',
          email: user.email,
          emailVerified: true,
          actorRole: 'member',
          accessTenantId: tenantId,
        },
      });
      expect(provider).toHaveBeenCalledExactlyOnceWith({
        headers,
        query: { disableCookieCache: true, disableRefresh: true },
      });
    }
  );

  it('uses explicit access scope before the compatibility home tenant', async () => {
    provider.mockResolvedValue({ user: { ...user, accessTenantId: 'pilot-mk' } });
    expect(await readFreshVerifiedSession(headers)).toMatchObject({
      ok: true,
      session: { accessTenantId: 'pilot-mk' },
    });
  });

  it('rechecks the provider on each call and refuses a revoked session', async () => {
    provider.mockResolvedValueOnce({ user }).mockResolvedValueOnce(null);
    expect(await readFreshVerifiedSession(headers)).toMatchObject({ ok: true });
    expect(await readFreshVerifiedSession(headers)).toEqual(denied);
    expect(provider).toHaveBeenCalledTimes(2);
    for (const [args] of provider.mock.calls) {
      expect(args).toEqual({ headers, query: { disableCookieCache: true, disableRefresh: true } });
    }
  });

  it.each([false, undefined, 'true', 1])(
    'never grants verified-email admission for %s',
    async emailVerified => {
      provider.mockResolvedValue({ user: { ...user, emailVerified } });
      expect(await readFreshVerifiedSession(headers)).toMatchObject({
        ok: true,
        session: { emailVerified: false },
      });
    }
  );

  it.each([
    null,
    undefined,
    {},
    { user: null },
    { user: [] },
    { user: { ...user, id: '' } },
    { user: { ...user, id: 1 } },
    { user: { ...user, email: undefined } },
    { user: { ...user, email: 'invalid' } },
    { user: { ...user, tenantId: undefined } },
    { user: { ...user, tenantId: 'unknown' } },
    { user: { ...user, tenantId: {} } },
    { user: { ...user, accessTenantId: '' } },
    { user: { ...user, accessTenantId: ' tenant_mk' } },
    { user: { ...user, accessTenantId: ['tenant_mk'] } },
  ])('fails closed on missing or malformed provider claims %j', async raw => {
    provider.mockResolvedValue(raw);
    expect(await readFreshVerifiedSession(headers)).toEqual(denied);
  });

  it('refuses provider errors without falling back to cached cookies', async () => {
    provider.mockRejectedValue(new Error('provider unavailable'));
    const result = await readFreshVerifiedSession(headers);
    expect(result).toEqual(denied);
    expect(provider).toHaveBeenCalledOnce();
  });
});
