import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return {
    from,
    limit,
    rateLimit: vi.fn(),
    resolveSession: vi.fn(),
    resumeDraft: vi.fn(),
    runAuthenticated: vi.fn(),
    select: vi.fn(() => ({ from })),
    submit: vi.fn(),
    where,
  };
});

vi.mock('@/lib/safe-action', () => ({ runAuthenticatedAction: h.runAuthenticated }));
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
}));
vi.mock('@interdomestik/database/claim-number', () => ({
  isValidClaimNumber: (value: string) => /^CLM-[A-Z0-9]{2,10}-\d{4}-\d{6}$/.test(value),
}));
vi.mock('drizzle-orm', () => ({
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
const session = {
  user: { id: 'member-1', role: 'member', tenantId: 'tenant_ks', email: 'm@example.com' },
};

describe('lookupSavedDraftClaim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.runAuthenticated.mockImplementation(async callback => ({
      success: true,
      data: await callback({ session, tenantId: 'tenant_ks', requestHeaders: new Headers() }),
    }));
    h.resolveSession.mockResolvedValue({ ok: true, context });
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
    h.resolveSession.mockResolvedValue({ ok: true, context: freshContext });
    await expect(lookupSavedDraftClaim({ id: draftId })).resolves.toEqual({ claim: null });
  });

  it('rejects malformed, extra-field and unavailable requests without disclosure', async () => {
    await expect(lookupSavedDraftClaim({ id: 'bad' })).resolves.toEqual({ claim: null });
    await expect(lookupSavedDraftClaim({ id: draftId, extra: true })).resolves.toEqual({
      claim: null,
    });
    h.runAuthenticated.mockResolvedValueOnce({ success: false, error: 'Unauthorized' });
    await expect(lookupSavedDraftClaim({ id: draftId })).resolves.toEqual({ claim: null });
    h.runAuthenticated.mockRejectedValue(new Error('unavailable'));
    await expect(lookupSavedDraftClaim({ id: draftId })).resolves.toEqual({ claim: null });
    expect(h.select).not.toHaveBeenCalled();
  });

  it('preserves framework redirects instead of converting them to an absent claim', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/en/login;307;',
    });
    h.runAuthenticated.mockRejectedValueOnce(redirect);
    await expect(lookupSavedDraftClaim({ id: draftId })).rejects.toBe(redirect);
  });

  it('collapses session/action tenant mismatch and database errors', async () => {
    h.runAuthenticated.mockImplementationOnce(async callback => ({
      success: true,
      data: await callback({ session, tenantId: 'tenant_mk', requestHeaders: new Headers() }),
    }));
    await expect(lookupSavedDraftClaim({ id: draftId })).resolves.toEqual({ claim: null });
    h.limit.mockRejectedValue(new Error('database unavailable'));
    await expect(lookupSavedDraftClaim({ id: draftId })).resolves.toEqual({ claim: null });
  });
});
