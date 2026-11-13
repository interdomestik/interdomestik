import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveFreeStartDraftSession } from './session.core';
import {
  createFreeStartDraftCore,
  updateFreeStartDraftCore,
  listFreeStartDraftsCore,
  resumeFreeStartDraftCore,
  type FreeStartDraftLifecycleDependencies,
} from './lifecycle.core';

const provider = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: provider } } }));
const headers = new Headers({
  host: 'ida.localhost',
  cookie: 'tenantId=tenant_ks',
  'x-tenant-id': 'tenant_ks',
});
const facts = {
  category: 'vehicle',
  resumeStep: 'details',
  summary: 'Owner draft notes.',
} as const;
const user = { id: 'owner-a', email: 'owner@example.test', emailVerified: true, role: 'member' };
function dependencies(): FreeStartDraftLifecycleDependencies {
  return {
    resolveSession: resolveFreeStartDraftSession,
    createDraft: vi.fn().mockResolvedValue({ ok: false, code: 'limitReached' }),
    updateDraft: vi.fn().mockResolvedValue({ ok: false, code: 'notFound' }),
    deleteDraft: vi.fn(),
    listDrafts: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    resumeDraft: vi.fn().mockResolvedValue({ ok: false, code: 'notFound' }),
  };
}
async function writeBoth(deps: FreeStartDraftLifecycleDependencies, tenantId: string) {
  const expectedContext = { ownerUserId: user.id, tenantId };
  return [
    await createFreeStartDraftCore(
      headers,
      { ...facts, clientRequestId: randomUUID(), expectedContext },
      deps
    ),
    await updateFreeStartDraftCore(
      headers,
      { ...facts, id: randomUUID(), expectedVersion: 1, expectedContext },
      deps
    ),
  ];
}
function expectNoEffects(deps: FreeStartDraftLifecycleDependencies): void {
  for (const effect of [
    deps.createDraft,
    deps.updateDraft,
    deps.deleteDraft,
    deps.listDrafts,
    deps.resumeDraft,
  ]) {
    expect(effect).not.toHaveBeenCalled();
  }
}

describe('draft core fresh session-derived scope', () => {
  beforeEach(() => {
    provider.mockReset();
    vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', 'tenant_ks');
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(['tenant_ks', 'tenant_mk', 'pilot-mk'])(
    'admits %s writes and reads despite ambient KS selectors',
    async tenantId => {
      provider.mockResolvedValue({ user: { ...user, tenantId } });
      const deps = dependencies();
      expect(await writeBoth(deps, tenantId)).toEqual([
        { ok: false, code: 'limitReached' },
        { ok: false, code: 'notFound' },
      ]);
      const context = {
        accessTenantId: tenantId,
        tenantId,
        ownerUserId: user.id,
        actorRole: 'member',
      };
      expect(deps.createDraft).toHaveBeenCalledWith(context, expect.any(Object));
      expect(deps.updateDraft).toHaveBeenCalledWith(context, expect.any(Object));
      const expectedContext = { ownerUserId: user.id, tenantId };
      expect(await listFreeStartDraftsCore(headers, { expectedContext }, deps)).toMatchObject({
        ok: true,
        expectedContext,
      });
      expect(deps.listDrafts).toHaveBeenCalledWith(context, { limit: 20 });
      expect(
        await resumeFreeStartDraftCore(headers, { id: randomUUID(), expectedContext }, deps)
      ).toEqual({ ok: false, code: 'notFound' });
      expect(provider).toHaveBeenCalledTimes(4);
      for (const [args] of provider.mock.calls) {
        expect(args).toEqual({
          headers,
          query: { disableCookieCache: true, disableRefresh: true },
        });
      }
    }
  );

  it('uses explicit session access scope rather than home/storage compatibility scope', async () => {
    provider.mockResolvedValue({
      user: { ...user, tenantId: 'tenant_ks', accessTenantId: 'pilot-mk' },
    });
    expect(await resolveFreeStartDraftSession(headers)).toMatchObject({
      ok: true,
      context: { tenantId: 'pilot-mk', accessTenantId: 'pilot-mk' },
    });
  });

  it.each(['tenant_ks', 'tenant_mk', 'pilot-mk'])(
    'denies unverified %s writes with zero effects while preserving reads',
    async tenantId => {
      provider.mockResolvedValue({ user: { ...user, tenantId, emailVerified: false } });
      const deps = dependencies();
      expect(await writeBoth(deps, tenantId)).toEqual([
        { ok: false, code: 'authRequired' },
        { ok: false, code: 'authRequired' },
      ]);
      expectNoEffects(deps);
      expect(await listFreeStartDraftsCore(headers, {}, deps)).toMatchObject({ ok: true });
    }
  );

  it.each([
    null,
    {},
    { user: { ...user, tenantId: null } },
    { user: { ...user, tenantId: 'bad' } },
  ])('denies missing/revoked/malformed authority %j before effects', async raw => {
    provider.mockResolvedValue(raw);
    const deps = dependencies();
    expect(await writeBoth(deps, 'tenant_ks')).toEqual([
      { ok: false, code: 'authRequired' },
      { ok: false, code: 'authRequired' },
    ]);
    expect(await listFreeStartDraftsCore(headers, {}, deps)).toEqual({
      ok: false,
      code: 'authRequired',
    });
    expect(await resumeFreeStartDraftCore(headers, { id: randomUUID() }, deps)).toEqual({
      ok: false,
      code: 'authRequired',
    });
    expectNoEffects(deps);
  });

  it.each([
    { ...user, id: 'switched-owner', tenantId: 'tenant_ks' },
    { ...user, tenantId: 'tenant_mk' },
    { ...user, tenantId: 'pilot-mk' },
  ])('refuses stale captured owner/tenant after account switch %j', async fresh => {
    provider.mockResolvedValue({ user: fresh });
    const deps = dependencies();
    expect(await writeBoth(deps, 'tenant_ks')).toEqual([
      { ok: false, code: 'unavailableAccountContext' },
      { ok: false, code: 'unavailableAccountContext' },
    ]);
    expectNoEffects(deps);
  });

  it('refuses conflicting host authorities before reading identity', async () => {
    expect(
      await resolveFreeStartDraftSession(
        new Headers({ host: 'ida.localhost', 'x-forwarded-host': 'attacker.example' })
      )
    ).toEqual({ ok: false, code: 'unavailable' });
    expect(provider).not.toHaveBeenCalled();
  });
});
