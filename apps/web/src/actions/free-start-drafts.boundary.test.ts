import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import {
  createFreeStartDraftCore,
  deleteFreeStartDraftCore,
  listFreeStartDraftsCore,
  resumeFreeStartDraftCore,
  type FreeStartDraftLifecycleDependencies,
} from './free-start-drafts/lifecycle.core';
import {
  resolveFreeStartDraftSession,
  type FreeStartDraftSessionDependencies,
} from './free-start-drafts/session.core';

const headers = new Headers({ host: 'ida.interdomestik.com' });
// prettier-ignore
const context = { accessTenantId: 'tenant_ks' as const, actorRole: 'member', ownerUserId: 'session-owner', tenantId: 'tenant_ks' as const };
// prettier-ignore
const facts = { category: 'vehicle', counterparty: 'Example Insurer', desiredOutcome: 'written_response', incidentDate: '2026-07-17', issueType: 'collision', resumeStep: 'preview', summary: 'Supported event facts only.' } as const;

function sessionDeps(
  overrides: Partial<FreeStartDraftSessionDependencies> = {}
): FreeStartDraftSessionDependencies {
  return {
    getSession: vi.fn().mockResolvedValue({ user: { id: 'owner-1', role: 'member' } }),
    isAllowedHost: vi.fn().mockReturnValue(true),
    resolveDefaultTenantId: vi.fn().mockReturnValue('tenant_ks'),
    resolveSessionAccessTenantId: vi.fn().mockReturnValue('tenant_ks'),
    ...overrides,
  };
}

function lifecycleDeps(
  overrides: Partial<FreeStartDraftLifecycleDependencies> = {}
): FreeStartDraftLifecycleDependencies {
  return {
    createDraft: vi.fn().mockResolvedValue({ ok: false, code: 'limitReached' }),
    deleteDraft: vi.fn().mockResolvedValue({ ok: false, code: 'notFound' }),
    listDrafts: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    resolveSession: vi.fn().mockResolvedValue({ ok: true, context }),
    resumeDraft: vi.fn().mockResolvedValue({ ok: false, code: 'notFound' }),
    updateDraft: vi.fn().mockResolvedValue({ ok: false, code: 'notFound' }),
    ...overrides,
  };
}

describe('free-start draft auth/action boundary C07-C12', () => {
  it('C07 requires exactly one authoritative uncached fresh session', async () => {
    const getSession = vi.fn().mockResolvedValue(null);
    expect(await resolveFreeStartDraftSession(headers, sessionDeps({ getSession }))).toEqual({
      ok: false,
      code: 'authRequired',
    });
    expect(getSession).toHaveBeenCalledOnce();
    expect(getSession).toHaveBeenCalledWith({
      headers,
      query: { disableCookieCache: true, disableRefresh: true },
    });
  });

  it('C08 denies a non-neutral host before session or tenant lookup', async () => {
    const getSession = vi.fn();
    const resolveDefaultTenantId = vi.fn();
    const result = await resolveFreeStartDraftSession(
      headers,
      sessionDeps({ getSession, isAllowedHost: () => false, resolveDefaultTenantId })
    );
    expect(result).toEqual({ ok: false, code: 'unavailable' });
    expect(getSession).not.toHaveBeenCalled();
    expect(resolveDefaultTenantId).not.toHaveBeenCalled();
  });

  it('C09 fails closed for missing, divergent, malformed or revoked session authority', async () => {
    const cases = [
      sessionDeps({ resolveSessionAccessTenantId: () => null }),
      sessionDeps({ resolveSessionAccessTenantId: () => 'tenant_mk' }),
      sessionDeps({ getSession: vi.fn().mockResolvedValue({ user: { id: ' ' } }) }),
    ];
    const results = await Promise.all(
      cases.map(deps => resolveFreeStartDraftSession(headers, deps))
    );
    expect(results).toEqual([
      { ok: false, code: 'authRequired' },
      { ok: false, code: 'unavailableAccountContext' },
      { ok: false, code: 'authRequired' },
    ]);
  });

  it('C10 derives actor, access tenant and role only from fresh server state', async () => {
    expect(await resolveFreeStartDraftSession(headers, sessionDeps())).toEqual({
      ok: true,
      context: {
        accessTenantId: 'tenant_ks',
        actorRole: 'member',
        ownerUserId: 'owner-1',
        tenantId: 'tenant_ks',
      },
    });
  });

  it('C11 keeps wrong-owner, wrong-tenant and unknown ids generically notFound', async () => {
    const id = randomUUID();
    const deps = lifecycleDeps();
    expect(await resumeFreeStartDraftCore(headers, { id }, deps)).toEqual({
      ok: false,
      code: 'notFound',
    });
    expect(await deleteFreeStartDraftCore(headers, { expectedVersion: 1, id }, deps)).toEqual({
      ok: false,
      code: 'notFound',
    });
  });

  it('C12 rejects client authority and returns content-free repository failure', async () => {
    const createDraft = vi.fn();
    const deps = lifecycleDeps({ createDraft });
    for (const authority of [
      { email: 'other@example.test' },
      { ownerUserId: 'other' },
      { tenantId: 'tenant_mk' },
      { accessTenantId: 'tenant_mk' },
    ]) {
      expect(
        await createFreeStartDraftCore(
          headers,
          { ...facts, clientRequestId: randomUUID(), ...authority },
          deps
        )
      ).toEqual({ ok: false, code: 'invalid' });
    }
    expect(createDraft).not.toHaveBeenCalled();
    const listDrafts = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const listDeps = lifecycleDeps({ listDrafts });
    expect(await listFreeStartDraftsCore(headers, { limit: 50 }, listDeps)).toEqual({
      ok: false,
      code: 'invalid',
    });
    expect(await listFreeStartDraftsCore(headers, {}, listDeps)).toEqual({
      ok: true,
      items: [],
      nextCursor: null,
    });
    expect(listDrafts).toHaveBeenCalledWith(context, { limit: 20 });
    deps.createDraft = vi.fn().mockRejectedValue(new Error('PRIVATE'));
    expect(
      await createFreeStartDraftCore(headers, { ...facts, clientRequestId: randomUUID() }, deps)
    ).toEqual({ ok: false, code: 'unavailable' });
  });
});
