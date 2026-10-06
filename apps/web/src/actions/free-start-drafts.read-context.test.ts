import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { FreeStartDraftSessionContext } from './free-start-drafts/session.core';
import {
  listFreeStartDraftsCore,
  resumeFreeStartDraftCore,
  type FreeStartDraftLifecycleDependencies,
} from './free-start-drafts/lifecycle.core';

const headers = new Headers({ host: 'ida.interdomestik.com' });
const context = {
  ownerUserId: 'owner-a',
  tenantId: 'tenant_ks' as const,
  accessTenantId: 'tenant_ks' as const,
  actorRole: 'member',
};
const expectedContext = { ownerUserId: context.ownerUserId, tenantId: context.tenantId };
function setup(current: FreeStartDraftSessionContext = context, emailVerified = false) {
  const dependencies: FreeStartDraftLifecycleDependencies = {
    resolveSession: vi.fn().mockResolvedValue({ ok: true, context: current, emailVerified }),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    deleteDraft: vi.fn(),
    listDrafts: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    resumeDraft: vi.fn().mockResolvedValue({ ok: false, code: 'notFound' }),
  };
  return dependencies;
}
async function readBoth(deps: FreeStartDraftLifecycleDependencies, captured: unknown) {
  return [
    await listFreeStartDraftsCore(headers, { expectedContext: captured }, deps),
    await resumeFreeStartDraftCore(headers, { id: randomUUID(), expectedContext: captured }, deps),
  ];
}
describe('captured account draft read context', () => {
  it.each([
    { ...context, ownerUserId: 'owner-b' },
    { ...context, tenantId: 'tenant_mk' as const, accessTenantId: 'tenant_mk' as const },
    { ...context, accessTenantId: 'tenant_mk' as const },
  ])('rejects stale owner/tenant before any repository read', async fresh => {
    const deps = setup(fresh);
    expect(await readBoth(deps, expectedContext)).toEqual([
      { ok: false, code: 'unavailableAccountContext' },
      { ok: false, code: 'unavailableAccountContext' },
    ]);
    expect(deps.listDrafts).not.toHaveBeenCalled();
    expect(deps.resumeDraft).not.toHaveBeenCalled();
  });
  it.each([null, {}, { ...expectedContext, role: 'admin' }])(
    'rejects malformed expectation %j',
    async captured => {
      const deps = setup();
      expect(await readBoth(deps, captured)).toEqual([
        { ok: false, code: 'invalid' },
        { ok: false, code: 'invalid' },
      ]);
      expect(deps.listDrafts).not.toHaveBeenCalled();
      expect(deps.resumeDraft).not.toHaveBeenCalled();
    }
  );
  it('allows same-owner unverified reads and echoes the exact query context', async () => {
    const deps = setup();
    deps.resumeDraft = vi.fn().mockResolvedValue({ ok: true, draft: { id: randomUUID() } });
    const [list, resume] = await readBoth(deps, expectedContext);
    expect(list).toEqual({ ok: true, items: [], nextCursor: null, expectedContext });
    expect(resume).toMatchObject({ ok: true, expectedContext });
    expect(deps.listDrafts).toHaveBeenCalledWith(context, { limit: 20 });
    expect(deps.resumeDraft).toHaveBeenCalledWith(context, expect.any(String));
    expect(deps.resolveSession).toHaveBeenCalledTimes(2);
  });
  it('retains missing-expectation legacy reads without a verification denial', async () => {
    const deps = setup();
    expect(await listFreeStartDraftsCore(headers, {}, deps)).toMatchObject({
      ok: true,
      expectedContext,
    });
    expect(await resumeFreeStartDraftCore(headers, { id: randomUUID() }, deps)).toEqual({
      ok: false,
      code: 'notFound',
    });
    expect(deps.listDrafts).toHaveBeenCalledOnce();
    expect(deps.resumeDraft).toHaveBeenCalledOnce();
  });
});
