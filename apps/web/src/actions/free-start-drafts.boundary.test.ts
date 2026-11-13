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
const expectedContext = { ownerUserId: context.ownerUserId, tenantId: context.tenantId };
// prettier-ignore
const facts = { category: 'vehicle', counterparty: 'Example Insurer', desiredOutcome: 'written_response', incidentDate: '2026-07-17', issueType: 'collision', resumeStep: 'preview', summary: 'Supported event facts only.' } as const;

function sessionDeps(
  overrides: Partial<FreeStartDraftSessionDependencies> = {}
): FreeStartDraftSessionDependencies {
  return {
    readSession: vi.fn().mockResolvedValue({
      ok: true,
      session: {
        userId: 'owner-1',
        email: 'owner@example.test',
        emailVerified: true,
        actorRole: 'member',
        accessTenantId: 'tenant_ks',
      },
    }),
    isAllowedHost: vi.fn().mockReturnValue(true),
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
    resolveSession: vi.fn().mockResolvedValue({ ok: true, context, emailVerified: true }),
    resumeDraft: vi.fn().mockResolvedValue({ ok: false, code: 'notFound' }),
    updateDraft: vi.fn().mockResolvedValue({ ok: false, code: 'notFound' }),
    ...overrides,
  };
}

describe('free-start draft auth/action boundary C07-C12', () => {
  it('C07 delegates to exactly one fresh session reader', async () => {
    const readSession = vi.fn().mockResolvedValue({ ok: false, code: 'authRequired' });
    expect(await resolveFreeStartDraftSession(headers, sessionDeps({ readSession }))).toEqual({
      ok: false,
      code: 'authRequired',
    });
    expect(readSession).toHaveBeenCalledExactlyOnceWith(headers);
  });

  it('C08 denies a non-neutral host before reading session authority', async () => {
    const readSession = vi.fn();
    expect(
      await resolveFreeStartDraftSession(
        headers,
        sessionDeps({ readSession, isAllowedHost: () => false })
      )
    ).toEqual({ ok: false, code: 'unavailable' });
    expect(readSession).not.toHaveBeenCalled();
  });

  it('C09 fails closed when the adapter denies missing, malformed or revoked authority', async () => {
    const readSession = vi.fn().mockResolvedValue({ ok: false, code: 'authRequired' });
    expect(await resolveFreeStartDraftSession(headers, sessionDeps({ readSession }))).toEqual({
      ok: false,
      code: 'authRequired',
    });
  });

  it('C10 derives actor, access tenant and role only from fresh server state', async () => {
    expect(await resolveFreeStartDraftSession(headers, sessionDeps())).toEqual({
      ok: true,
      emailVerified: true,
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
          { ...facts, clientRequestId: randomUUID(), expectedContext, ...authority },
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
      expectedContext,
    });
    expect(listDrafts).toHaveBeenCalledWith(context, { limit: 20 });
    deps.createDraft = vi.fn().mockRejectedValue(new Error('PRIVATE'));
    expect(
      await createFreeStartDraftCore(
        headers,
        { ...facts, clientRequestId: randomUUID(), expectedContext },
        deps
      )
    ).toEqual({ ok: false, code: 'unavailable' });
  });
});
