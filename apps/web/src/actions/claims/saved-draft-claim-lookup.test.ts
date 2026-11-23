import '@/test/tenant-transaction.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const txSelect = vi.fn(() => ({ from }));
  const contexts: unknown[] = [];
  return {
    contexts,
    audit: vi.fn(),
    from,
    limit,
    rateLimit: vi.fn(),
    resolveSession: vi.fn(),
    resumeDraft: vi.fn(),
    // Unscoped client sentinel: the recovery read must never use it.
    select: vi.fn(() => ({ from })),
    submit: vi.fn(),
    txSelect,
    where,
    withTenantContext: vi.fn(
      async (context: unknown, action: (tx: { select: typeof txSelect }) => Promise<unknown>) => {
        contexts.push(context);
        return action({ select: txSelect });
      }
    ),
  };
});

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: vi.fn() }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: h.audit }));
vi.mock('@/actions/free-start-drafts/session.core', () => ({
  resolveFreeStartDraftSession: h.resolveSession,
}));
vi.mock('@interdomestik/database/free-start-drafts', () => ({
  resumeFreeStartDraft: h.resumeDraft,
}));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimitForAction: h.rateLimit }));
vi.mock('./submit.core', () => ({ submitClaimCore: h.submit }));
vi.mock('@interdomestik/database', () => ({
  claims: { claimNumber: 'claimNumber', id: 'id', tenantId: 'tenantId', userId: 'userId' },
  db: { select: h.select },
  withTenantContext: h.withTenantContext,
}));
vi.mock('@interdomestik/database/claim-number', () => ({
  isValidClaimNumber: (value: string) => /^CLM-[A-Z0-9]{2,10}-\d{4}-\d{6}$/.test(value),
}));
vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  and: (...args: unknown[]) => args,
  eq: (left: unknown, right: unknown) => [left, right],
}));

import { lookupSavedDraftClaim } from './create-from-saved-draft';
import { savedDraftClaimId } from './saved-draft-claim-identity';

const draftId = '63ffc31e-8c64-4758-995a-c57f40de7568';
const claimId = savedDraftClaimId('tenant_ks', 'member-1', draftId);
const context = {
  accessTenantId: 'tenant_ks',
  actorRole: 'member',
  ownerUserId: 'member-1',
  tenantId: 'tenant_ks',
};
const authority = mintTestTenantAuthority('tenant_ks');
const session = {
  user: { id: 'member-1', role: 'member', tenantId: 'tenant_ks', email: 'm@example.com' },
};

describe('lookupSavedDraftClaim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.contexts.length = 0;
    h.audit.mockResolvedValue({ ok: true });
    h.resolveSession.mockResolvedValue({ ok: true, context, authorized: { session, authority } });
    h.limit.mockResolvedValue([{ id: claimId, claimNumber: 'CLM-KS-2026-000001' }]);
  });

  it('returns only the exact authenticated owner and tenant claim identity', async () => {
    await expect(lookupSavedDraftClaim({ id: draftId.toUpperCase() })).resolves.toEqual({
      claim: { id: claimId, number: 'CLM-KS-2026-000001' },
    });
    expect(h.limit).toHaveBeenCalledTimes(1);
    expect(h.where).toHaveBeenCalledWith([
      ['id', claimId],
      ['tenantId', 'tenant_ks'],
      ['userId', 'member-1'],
    ]);
    expect(h.resumeDraft).not.toHaveBeenCalled();
    expect(h.submit).not.toHaveBeenCalled();
    expect(h.rateLimit).not.toHaveBeenCalled();
    expect(h.contexts).toHaveLength(1);
    expect(h.contexts[0]).toBe(authority);
    expect(h.txSelect).toHaveBeenCalledTimes(1);
    expect(h.select).not.toHaveBeenCalled();
  });

  it('normalizes mixed-case UUIDs to the legacy lowercase B1 identity', () => {
    expect(savedDraftClaimId('tenant_ks', 'member-1', draftId.toUpperCase())).toBe(claimId);
  });

  it.each([
    ['absent', [], context],
    ['malformed row', [{ id: claimId, claimNumber: 'broken' }], context],
    [
      'wrong owner',
      [{ id: claimId, claimNumber: 'CLM-KS-2026-000001' }],
      { ...context, ownerUserId: 'other' },
    ],
    [
      'wrong tenant',
      [{ id: claimId, claimNumber: 'CLM-KS-2026-000001' }],
      { ...context, accessTenantId: 'tenant_mk' },
    ],
  ])('collapses %s to no claim', async (_name, rows, freshContext) => {
    h.limit.mockResolvedValue(rows);
    h.resolveSession.mockResolvedValue({
      ok: true,
      context: freshContext,
      authorized: { session, authority },
    });
    await expect(lookupSavedDraftClaim({ id: draftId })).resolves.toEqual({ claim: null });
  });

  it('rejects malformed, extra-field and unavailable requests without disclosure', async () => {
    await expect(lookupSavedDraftClaim({ id: 'bad' })).resolves.toEqual({ claim: null });
    await expect(lookupSavedDraftClaim({ id: draftId, extra: true })).resolves.toEqual({
      claim: null,
    });
    h.resolveSession.mockResolvedValueOnce({ ok: false, code: 'authRequired' });
    await expect(lookupSavedDraftClaim({ id: draftId })).resolves.toEqual({ claim: null });
    h.resolveSession.mockResolvedValueOnce({ ok: false, code: 'unavailable' });
    await expect(lookupSavedDraftClaim({ id: draftId })).resolves.toEqual({ code: 'unavailable' });
    expect(h.select).not.toHaveBeenCalled();
    expect(h.txSelect).not.toHaveBeenCalled();
  });

  it('preserves framework redirects instead of converting them to an absent claim', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/en/login;307;',
    });
    h.resolveSession.mockRejectedValueOnce(redirect);
    await expect(lookupSavedDraftClaim({ id: draftId })).rejects.toBe(redirect);
  });

  it('records the branch scope refusal before returning no claim', async () => {
    const user = { ...session.user, role: 'branch_manager', branchId: null };
    h.resolveSession.mockResolvedValueOnce({
      ok: true,
      context: { ...context, actorRole: user.role },
      authorized: { session: { user }, authority },
    });
    await expect(lookupSavedDraftClaim({ id: draftId })).resolves.toEqual({ claim: null });
    expect(h.audit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        action: 'action.refused',
        actorId: user.id,
        actorRole: user.role,
        authority,
        metadata: expect.objectContaining({ code: 'FORBIDDEN_NO_BRANCH' }),
      })
    );
    expect(h.withTenantContext).not.toHaveBeenCalled();
  });

  it('conceals a tenant mismatch and reports a database failure', async () => {
    h.resolveSession.mockResolvedValueOnce({
      ok: true,
      context,
      authorized: { session: { user: { ...session.user, tenantId: 'tenant_mk' } }, authority },
    });
    await expect(lookupSavedDraftClaim({ id: draftId })).resolves.toEqual({ claim: null });
    h.limit.mockRejectedValue(new Error('database unavailable'));
    await expect(lookupSavedDraftClaim({ id: draftId })).resolves.toEqual({ code: 'unavailable' });
  });
});
