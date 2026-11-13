import { createHash } from 'node:crypto';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
// prettier-ignore
const h = vi.hoisted(() => { const limit = vi.fn(); const where = vi.fn(() => ({ limit })); const from = vi.fn(() => ({ where })); return { contexts: [] as unknown[], from, limit, rateLimit: vi.fn(), resolveSession: vi.fn(), resumeDraft: vi.fn(), runAuthenticated: vi.fn(), select: vi.fn(() => ({ from })), submit: vi.fn() }; });
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
  // The recovery read owns its tenant context; the select alias stays shared.
  withTenantContext: vi.fn(
    async (context: unknown, action: (tx: { select: typeof h.select }) => Promise<unknown>) => {
      h.contexts.push(context);
      return action({ select: h.select });
    }
  ),
}));
vi.mock('@interdomestik/database/claim-number', () => ({
  isValidClaimNumber: (value: string) => /^CLM-[A-Z0-9]{2,10}-\d{4}-\d{6}$/.test(value),
}));
vi.unmock('next-intl');
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  const catalogs: Record<string, Record<string, unknown>> = {
    en: (await import('../../messages/en/freeStart.json')).default,
    mk: (await import('../../messages/mk/freeStart.json')).default,
  };
  return {
    getLocale: () => Promise.reject(new Error('implicit getLocale() is not allowed in actions')),
    getTranslations: ({ locale }: { locale: string }) =>
      Promise.resolve(
        createTranslator({
          locale,
          messages: catalogs[locale] as never,
          namespace: 'freeStart' as never,
        })
      ),
  };
});
vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (left: unknown, right: unknown) => [left, right],
}));
import { createClaimFromSavedDraft } from './create-from-saved-draft';
const authority = mintTestTenantAuthority('tenant_ks');
const session = {
  user: { id: 'member-1', role: 'member', tenantId: 'tenant_ks', email: 'm@example.com' },
};
// prettier-ignore
const context = { accessTenantId: 'tenant_ks', actorRole: 'member', ownerUserId: 'member-1', tenantId: 'tenant_ks' };
// prettier-ignore
const draft = { category: 'vehicle', clientRequestId: 'request-1', counterparty: 'Example Insurer', createdAt: '2026-08-08T00:00:00.000Z', desiredOutcome: 'repair', id: '63ffc31e-8c64-4758-995a-c57f40de7568', incidentDate: '2026-07-20', issueType: 'collision', resumeStep: 'preview', summary: 'The vehicle was damaged and needs a documented repair.', updatedAt: '2026-08-08T00:00:00.000Z', version: 3 };
const input = { id: draft.id, expectedVersion: 3 };
const fromPage = (path: string) =>
  new Headers({ referer: `https://ida.example${path}/member/claims/new` });
const confirmedClaimStart = {
  confirmed: true as const,
  handoffContext: {
    source: 'diaspora-green-card' as const,
    country: 'IT' as const,
    incidentLocation: 'abroad' as const,
  },
  incidentCountryCode: 'IT' as const,
};
const claimId = `fsd_${createHash('sha256')
  .update(JSON.stringify(['tenant_ks', 'member-1', draft.id]))
  .digest('hex')}`;
const success = { success: true, claimId, claimNumber: 'CLM-KS-2026-000001' };
describe('createClaimFromSavedDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.contexts.length = 0;
    h.runAuthenticated.mockImplementation(async callback =>
      callback({ session, authority, tenantId: 'tenant_ks', requestHeaders: fromPage('/en') })
    );
    h.resolveSession.mockResolvedValue({ ok: true, context });
    h.resumeDraft.mockResolvedValue({ ok: true, draft });
    h.rateLimit.mockResolvedValue({ limited: false });
    h.limit.mockResolvedValue([]);
    h.submit.mockResolvedValue(success);
  });
  it('rejects non-strict input before reading or writing', async () => {
    await expect(createClaimFromSavedDraft({ ...input, extra: true })).resolves.toMatchObject({
      success: false,
    });
    expect(h.resolveSession).not.toHaveBeenCalled();
    expect(h.submit).not.toHaveBeenCalled();
  });
  it('maps one complete owned draft into the canonical submit writer', async () => {
    const result = await createClaimFromSavedDraft(input);
    expect(result).toEqual(success);
    expect(h.rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'action:submit-claim', limit: 5, windowSeconds: 600 })
    );
    expect(h.contexts.length).toBeGreaterThan(0);
    for (const used of h.contexts) expect(used).toBe(authority);
    expect(h.submit.mock.calls[0]![0].authority).toBe(authority);
    expect(h.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `ida-ui03a2-b1:${draft.id}`,
        trustedClaimId: claimId,
        data: {
          category: 'vehicle',
          companyName: 'Example Insurer',
          currency: 'EUR',
          description:
            'Claim type: Vehicle damage\nIssue: Collision damage\nIncident date: 07/20/2026\nCounterparty: Example Insurer\nRequested outcome: Repair or replacement costs\nSummary: The vehicle was damaged and needs a documented repair.',
          files: [],
          incidentDate: '2026-07-20',
          title: 'Vehicle damage: Collision damage',
        },
      })
    );
  });
  it('submits an explicitly confirmed diaspora country with provenance context', async () => {
    await expect(
      createClaimFromSavedDraft({ ...input, claimStart: confirmedClaimStart })
    ).resolves.toEqual(success);
    expect(h.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ incidentCountryCode: 'IT' }),
        handoffContext: confirmedClaimStart.handoffContext,
      })
    );
  });
  it.each([
    ['false confirmation', { ...confirmedClaimStart, confirmed: false }],
    ['mismatched country', { ...confirmedClaimStart, incidentCountryCode: 'DE' }],
    [
      'unsupported country',
      {
        ...confirmedClaimStart,
        handoffContext: { ...confirmedClaimStart.handoffContext, country: 'FR' },
        incidentCountryCode: 'FR',
      },
    ],
  ])('rejects %s before reading or writing', async (_name, claimStart) => {
    await expect(createClaimFromSavedDraft({ ...input, claimStart })).resolves.toMatchObject({
      success: false,
    });
    expect(h.resolveSession).not.toHaveBeenCalled();
    expect(h.submit).not.toHaveBeenCalled();
  });
  it('maps property codes and drops diaspora handoff', async () => {
    h.resumeDraft.mockResolvedValue({
      ok: true,
      draft: {
        ...draft,
        category: 'property',
        issueType: 'water_damage',
        desiredOutcome: 'reimbursement',
      },
    });
    await createClaimFromSavedDraft({ ...input, claimStart: confirmedClaimStart });
    const payload = h.submit.mock.calls[0]![0];
    // prettier-ignore
    expect(payload).toMatchObject({ data: { category: 'property', description: expect.stringContaining('Requested outcome: Expense reimbursement'), title: 'Property damage: Water damage' }, handoffContext: undefined });
    expect(payload.data).not.toHaveProperty('incidentCountryCode');
  });
  // prettier-ignore
  it.each([
    ['fresh-session mismatch', { ...context, ownerUserId: 'other' }, draft, false],
    ['access-tenant mismatch', { ...context, accessTenantId: 'tenant_mk' }, draft, false],
    ['stale version', context, { ...draft, version: 4 }, false],
    ['incomplete draft', context, { ...draft, summary: '' }, false],
    ['short counterparty', context, { ...draft, counterparty: 'x' }, false],
    ['unsupported category', context, { ...draft, category: 'injury' }, false], ['non-preview step', context, { ...draft, resumeStep: 'details' }, false], ['non-preview property step', context, { ...draft, category: 'property', issueType: 'water_damage', desiredOutcome: 'reimbursement', resumeStep: 'details' }, false], ['stale property version', context, { ...draft, category: 'property', issueType: 'water_damage', desiredOutcome: 'reimbursement', version: 4 }, false], ['prototype category', context, { ...draft, category: 'constructor' }, false], ['prototype issue', context, { ...draft, issueType: 'toString' }, false], ['prototype outcome', context, { ...draft, desiredOutcome: 'constructor' }, false], ['outer rate limit', context, draft, true],
  ])('fails closed for %s', async (_name, freshContext, savedDraft, limited) => {
    h.resolveSession.mockResolvedValue({ ok: true, context: freshContext });
    h.resumeDraft.mockResolvedValue({ ok: true, draft: savedDraft });
    h.rateLimit.mockResolvedValue({ limited });
    await expect(createClaimFromSavedDraft(input)).resolves.toMatchObject({ success: false });
    expect(h.submit).not.toHaveBeenCalled();
  });
  it.each(['fresh-session', 'missing-draft'])('stops when %s is unavailable', async seam => {
    if (seam === 'fresh-session') h.resolveSession.mockResolvedValue({ ok: false });
    else h.resumeDraft.mockResolvedValue({ ok: false, code: 'notFound' });
    await expect(createClaimFromSavedDraft(input)).resolves.toMatchObject({ success: false });
    expect(h.submit).not.toHaveBeenCalled();
  });
  it('returns an exact recovered claim before stale-version or preview rejection', async () => {
    // prettier-ignore
    h.resumeDraft.mockResolvedValue({ ok: true, draft: { ...draft, resumeStep: 'details', version: 4 } });
    h.limit.mockResolvedValue([{ id: claimId, claimNumber: success.claimNumber }]);
    await expect(createClaimFromSavedDraft(input)).resolves.toEqual(success);
    expect(h.submit).not.toHaveBeenCalled();
  });
  it('recovers one exact valid claim after an ambiguous writer failure', async () => {
    h.limit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: claimId, claimNumber: success.claimNumber }]);
    h.submit.mockRejectedValue(new Error('ambiguous timeout'));
    await expect(createClaimFromSavedDraft(input)).resolves.toEqual(success);
    expect(h.limit).toHaveBeenCalledTimes(2);
  });
  it('does not disclose or accept malformed exact-id recovery', async () => {
    h.limit.mockResolvedValue([{ id: claimId, claimNumber: 'broken' }]);
    await expect(createClaimFromSavedDraft(input)).resolves.toMatchObject({ success: false });
    expect(h.submit).not.toHaveBeenCalled();
  });
  it('returns truthful failure for canonical denial or a mismatched reservation', async () => {
    h.submit.mockResolvedValue({ success: false, code: 'MEMBERSHIP_REQUIRED' });
    await expect(createClaimFromSavedDraft(input)).resolves.toMatchObject({ success: false });
    h.submit.mockResolvedValue({ ...success, claimId: 'other-claim' });
    await expect(createClaimFromSavedDraft(input)).resolves.toMatchObject({ success: false });
    expect(h.limit).toHaveBeenCalledTimes(4);
  });
  it('stores the claim text in the explicit route locale (qa3 #67)', async () => {
    await createClaimFromSavedDraft({ ...input, locale: 'mk' });
    expect(h.submit.mock.calls[0]![0].data).toMatchObject({
      title: 'Штета на возило: Штета од судир',
      description: expect.stringContaining('20.07.2026'),
    });
  });
  it('uses the posting page locale when the caller sends none, never the default', async () => {
    h.runAuthenticated.mockImplementation(callback =>
      callback({ session, authority, tenantId: 'tenant_ks', requestHeaders: fromPage('/mk') })
    );
    await createClaimFromSavedDraft(input);
    expect(h.submit.mock.calls[0]![0].data.title).toBe('Штета на возило: Штета од судир');
  });
  it('rejects an unsupported locale as non-strict input', async () => {
    await expect(createClaimFromSavedDraft({ ...input, locale: 'hr' })).resolves.toMatchObject({
      success: false,
    });
    expect(h.submit).not.toHaveBeenCalled();
  });
});
