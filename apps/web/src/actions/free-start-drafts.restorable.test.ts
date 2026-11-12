import { describe, expect, it, vi } from 'vitest';
import type { FreeStartDraft } from '@interdomestik/database/free-start-drafts';
import {
  listFreeStartDraftsCore,
  resumeFreeStartDraftCore,
  type FreeStartDraftLifecycleDependencies,
} from './free-start-drafts/lifecycle.core';

const id = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
const headers = new Headers({ host: 'ida.interdomestik.com' });
const context = { ownerUserId: 'member', tenantId: 'tenant_ks', accessTenantId: 'tenant_ks' };
const expectedContext = { ownerUserId: context.ownerUserId, tenantId: context.tenantId };
const draft = (draftId: string) => ({ id: draftId }) as FreeStartDraft;

function dependencies() {
  return {
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    deleteDraft: vi.fn(),
    resolveSession: vi.fn().mockResolvedValue({ ok: true, context, emailVerified: true }),
    listDrafts: vi.fn().mockResolvedValue({ items: [draft(id), draft(otherId)], nextCursor: null }),
    resumeDraft: vi.fn().mockResolvedValue({ ok: true, draft: draft(id) }),
    findConvertedDrafts: vi.fn().mockResolvedValue(new Set([id])),
  } satisfies FreeStartDraftLifecycleDependencies;
}

describe('restorable account drafts', () => {
  it('excludes converted drafts while preserving the repository cursor and live drafts', async () => {
    const deps = dependencies();
    const nextCursor = { id: otherId, updatedAt: '2026-11-12T10:00:00.000Z' };
    deps.listDrafts.mockResolvedValueOnce({ items: [draft(id), draft(otherId)], nextCursor });
    expect(await listFreeStartDraftsCore(headers, { expectedContext }, deps)).toEqual({
      ok: true,
      items: [draft(otherId)],
      nextCursor,
      expectedContext,
    });
    expect(deps.findConvertedDrafts).toHaveBeenCalledWith(context, [id, otherId], headers);
  });

  it('leaves no draft for bootstrap to restore when the only draft was converted', async () => {
    const deps = dependencies();
    deps.listDrafts.mockResolvedValueOnce({ items: [draft(id)], nextCursor: null });
    expect(await listFreeStartDraftsCore(headers, {}, deps)).toMatchObject({ ok: true, items: [] });
  });

  it('rejects direct resume of a converted draft before the repository resume audit', async () => {
    const deps = dependencies();
    expect(await resumeFreeStartDraftCore(headers, { id, expectedContext }, deps)).toEqual({
      ok: false,
      code: 'notFound',
    });
    expect(deps.resumeDraft).not.toHaveBeenCalled();
  });

  it('preserves direct resume for a draft without a converted claim', async () => {
    const deps = dependencies();
    deps.findConvertedDrafts.mockResolvedValueOnce(new Set());
    expect(await resumeFreeStartDraftCore(headers, { id, expectedContext }, deps)).toMatchObject({
      ok: true,
      draft: { id },
      expectedContext,
    });
  });

  it('fails closed when converted-claim lookup fails', async () => {
    const deps = dependencies();
    deps.findConvertedDrafts.mockRejectedValue(new Error('database unavailable'));
    expect(await listFreeStartDraftsCore(headers, {}, deps)).toEqual({
      ok: false,
      code: 'unavailable',
    });
    expect(await resumeFreeStartDraftCore(headers, { id }, deps)).toEqual({
      ok: false,
      code: 'unavailable',
    });
    expect(deps.resumeDraft).not.toHaveBeenCalled();
  });
});
