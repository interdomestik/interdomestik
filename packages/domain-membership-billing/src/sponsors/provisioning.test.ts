import { assertNewSalesOpen, SalesClosedError } from '@interdomestik/database/pilot-switch';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { admitPersonEntries } from '../sponsor-coverage/admission';
import { produceEntryStart } from '../sponsor-coverage/entry-start';
import type { CoverageEntry } from '../sponsor-coverage/evaluate';
import { readPersonCoverage } from '../sponsor-coverage/resolve';
import { auditTransaction } from './audit-test-support';
import { provisionEntry } from './provisioning';
import { insertGroupSponsorRow, mark, review, setStart } from './provisioning-effects';
import { readProvisioningFacts, type ProvisioningEntryFacts } from './provisioning-facts';
import { linkHandoverIntent } from './provisioning-intent';

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(),
}));
vi.mock('@interdomestik/database/pilot-switch', async original => ({
  ...(await original<typeof import('@interdomestik/database/pilot-switch')>()),
  assertNewSalesOpen: vi.fn(),
}));
vi.mock('@interdomestik/database/sponsor-locks', () => ({
  lockSponsorEntryIdentity: vi.fn(),
  lockSponsorPerson: vi.fn(),
}));
vi.mock('../sponsor-coverage/admission', () => ({ admitPersonEntries: vi.fn() }));
vi.mock('../sponsor-coverage/entry-start', () => ({ produceEntryStart: vi.fn() }));
vi.mock('../sponsor-coverage/resolve', () => ({ readPersonCoverage: vi.fn() }));
vi.mock('./provisioning-facts', () => ({ readProvisioningFacts: vi.fn() }));
vi.mock('./provisioning-intent', () => ({ linkHandoverIntent: vi.fn() }));
vi.mock('./provisioning-effects', () => ({
  mark: vi.fn(),
  review: vi.fn(),
  setStart: vi.fn(),
  settle: vi.fn(),
  insertGroupSponsorRow: vi.fn(),
}));

const authority = mintTestTenantAuthority('tenant');
const now = new Date('2027-02-01T00:00:00Z');
const facts: ProvisioningEntryFacts = {
  tenantId: 'tenant',
  entryId: 'entry',
  termId: 'term',
  userId: 'member',
  emailHmac: null,
  emailNormalized: null,
  firstName: null,
  lastName: null,
  conflictDecision: 'accepted',
  outcome: 'pending',
  revoked: false,
  termStart: new Date('2027-01-01T00:00:00Z'),
  effectiveEnd: new Date('2028-01-01T00:00:00Z'),
  branchId: 'branch',
  planId: 'standard',
  planKey: 'plan-row',
  termsVersion: '1',
};

function use(status: string, termStart = facts.termStart) {
  const db = auditTransaction({
    selects: [
      [{ role: 'member' }],
      [{ id: 'subscription', provider: 'paddle', status, providerSubscriptionId: 'provider' }],
    ],
  });
  vi.mocked(withTenantAuthority).mockImplementation(async (_authority, fn) => fn(db.tx));
  vi.mocked(readProvisioningFacts).mockResolvedValue({ ...facts, termStart });
  return db.tx;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(assertNewSalesOpen).mockResolvedValue(undefined);
  vi.mocked(admitPersonEntries).mockResolvedValue([{ entryId: 'entry', decision: 'accepted' }]);
  vi.mocked(readPersonCoverage).mockResolvedValue(null);
  vi.mocked(produceEntryStart).mockResolvedValue({
    outcome: 'seated',
    reviewReason: null,
    mails: [],
  });
});

describe('provisionEntry case effects', () => {
  it('refuses creation of a new account before any write while sales are closed', async () => {
    const db = auditTransaction();
    vi.mocked(withTenantAuthority).mockImplementation(async (_authority, fn) => fn(db.tx));
    vi.mocked(readProvisioningFacts).mockResolvedValue({
      ...facts,
      userId: null,
      emailHmac: 'entry-hmac',
      emailNormalized: 'member@example.test',
    });
    vi.mocked(assertNewSalesOpen).mockRejectedValueOnce(new SalesClosedError());

    await expect(
      provisionEntry(authority, { entryId: 'entry', now, hasCredential: vi.fn() })
    ).rejects.toBeInstanceOf(SalesClosedError);
    expect(assertNewSalesOpen).toHaveBeenCalledExactlyOnceWith(db.tx, 'tenant');
    expect(db.tx.insert).not.toHaveBeenCalled();
    expect(db.tx.update).not.toHaveBeenCalled();
    expect(admitPersonEntries).not.toHaveBeenCalled();
    expect(produceEntryStart).not.toHaveBeenCalled();
  });

  it('checks before creating group coverage for a bound account with no subscription', async () => {
    const db = auditTransaction({ selects: [[{ role: 'member' }], []] });
    vi.mocked(withTenantAuthority).mockImplementation(async (_authority, fn) => fn(db.tx));
    vi.mocked(readProvisioningFacts).mockResolvedValue(facts);
    vi.mocked(assertNewSalesOpen).mockRejectedValueOnce(new SalesClosedError());

    await expect(
      provisionEntry(authority, { entryId: 'entry', now, hasCredential: vi.fn() })
    ).rejects.toBeInstanceOf(SalesClosedError);
    expect(assertNewSalesOpen).toHaveBeenCalledExactlyOnceWith(db.tx, 'tenant');
    expect(insertGroupSponsorRow).not.toHaveBeenCalled();
    expect(setStart).not.toHaveBeenCalled();
    expect(produceEntryStart).not.toHaveBeenCalled();
  });

  it.each(['expired', 'canceled'])(
    'refuses a new seat for a %s Paddle subscription while sales are closed',
    async status => {
      const tx = use(status);
      vi.mocked(assertNewSalesOpen).mockRejectedValueOnce(new SalesClosedError());
      const hasCredential = vi.fn();

      await expect(
        provisionEntry(authority, { entryId: 'entry', now, hasCredential })
      ).rejects.toBeInstanceOf(SalesClosedError);

      expect(assertNewSalesOpen).toHaveBeenCalledExactlyOnceWith(tx, 'tenant');
      expect(setStart).not.toHaveBeenCalled();
      expect(produceEntryStart).not.toHaveBeenCalled();
      expect(hasCredential).not.toHaveBeenCalled();
    }
  );

  it('checks sales in the writing transaction before seating an expired Paddle subscriber', async () => {
    const tx = use('expired');
    const hasCredential = vi.fn().mockResolvedValue(true);

    await expect(
      provisionEntry(authority, { entryId: 'entry', now, hasCredential })
    ).resolves.toEqual({
      outcome: 'seated',
      createdUserId: null,
    });

    expect(assertNewSalesOpen).toHaveBeenCalledExactlyOnceWith(tx, 'tenant');
    expect(assertNewSalesOpen).toHaveBeenCalledBefore(vi.mocked(setStart));
    expect(produceEntryStart).toHaveBeenCalledWith(tx, {
      tenantId: 'tenant',
      entryId: 'entry',
      handover: false,
      hasCredential: true,
      interval: { start: now, end: facts.effectiveEnd },
    });
  });

  it('preserves an existing sponsor coverage chain during a sales stop', async () => {
    const tx = use('expired');
    vi.mocked(assertNewSalesOpen).mockRejectedValue(new SalesClosedError());
    const entry: CoverageEntry = {
      id: facts.entryId,
      sponsorId: 'sponsor',
      termId: facts.termId,
      termStart: facts.termStart,
      termEnd: facts.effectiveEnd,
      terminatedEffectiveAt: null,
      termEffective: true,
      planId: facts.planId,
      planKey: facts.planKey,
      legalEntityId: 'entity',
      conflictDecision: 'accepted',
      revokedAt: null,
      outcome: 'pending',
      startsAt: null,
      handoverPaidUntil: null,
    };
    const previousStart = new Date('2026-01-01T00:00:00Z');
    vi.mocked(readPersonCoverage).mockResolvedValue({
      subscription: null,
      entries: [
        {
          ...entry,
          id: 'prior-entry',
          termId: 'prior-term',
          termStart: previousStart,
          termEnd: facts.termStart,
          outcome: 'seated',
          startsAt: previousStart,
        },
        entry,
      ],
    });

    const hasCredential = vi.fn().mockResolvedValue(true);
    await expect(
      provisionEntry(authority, { entryId: 'entry', now, hasCredential })
    ).resolves.toMatchObject({
      outcome: 'seated',
    });
    expect(assertNewSalesOpen).not.toHaveBeenCalled();
    expect(setStart).toHaveBeenCalledWith(tx, 'tenant', 'entry', facts.termStart);
    expect(produceEntryStart).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        handover: false,
        interval: { start: facts.termStart, end: facts.effectiveEnd },
      })
    );
  });

  it('links active Paddle coverage before a future term starts without starting the entry', async () => {
    use('active', new Date('2027-03-01'));
    vi.mocked(linkHandoverIntent).mockResolvedValue({
      kind: 'linked',
      intentId: 'intent',
      paidUntil: null,
    });
    const hasCredential = vi.fn();
    expect(await provisionEntry(authority, { entryId: 'entry', now, hasCredential })).toEqual({
      outcome: 'awaiting_paid_end',
      createdUserId: null,
    });
    expect(linkHandoverIntent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: 'handover' })
    );
    expect(mark).toHaveBeenCalledWith(expect.anything(), 'tenant', 'entry', 'awaiting_paid_end');
    expect(produceEntryStart).not.toHaveBeenCalled();
    expect(hasCredential).not.toHaveBeenCalled();
  });

  it('waits on future past-due coverage without creating a staff intent', async () => {
    use('past_due', new Date('2027-03-01'));
    expect(
      await provisionEntry(authority, { entryId: 'entry', now, hasCredential: vi.fn() })
    ).toEqual({
      outcome: 'waiting',
      createdUserId: null,
    });
    expect(linkHandoverIntent).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
  });

  it('publishes a linked paid-end interval with the credential snapshot during a sales stop', async () => {
    use('active');
    vi.mocked(assertNewSalesOpen).mockRejectedValue(new SalesClosedError());
    const paidUntil = new Date('2027-04-01');
    vi.mocked(linkHandoverIntent).mockResolvedValue({
      kind: 'linked',
      intentId: 'intent',
      paidUntil,
    });
    const hasCredential = vi.fn().mockResolvedValue(true);
    expect(await provisionEntry(authority, { entryId: 'entry', now, hasCredential })).toEqual({
      outcome: 'seated',
      createdUserId: null,
    });
    expect(produceEntryStart).toHaveBeenCalledWith(expect.anything(), {
      tenantId: 'tenant',
      entryId: 'entry',
      handover: true,
      hasCredential: true,
      interval: { start: paidUntil, end: facts.effectiveEnd },
    });
    expect(hasCredential).toHaveBeenCalledWith('member');
    expect(assertNewSalesOpen).not.toHaveBeenCalled();
    expect(setStart).not.toHaveBeenCalled();
  });

  it('preserves immediate fallback after a handover can no longer collect during a sales stop', async () => {
    use('active');
    vi.mocked(assertNewSalesOpen).mockRejectedValue(new SalesClosedError());
    vi.mocked(linkHandoverIntent).mockResolvedValue({ kind: 'immediate' });
    expect(
      await provisionEntry(authority, {
        entryId: 'entry',
        now,
        hasCredential: vi.fn().mockResolvedValue(false),
      })
    ).toEqual({
      outcome: 'seated',
      createdUserId: null,
    });
    expect(assertNewSalesOpen).not.toHaveBeenCalled();
    expect(setStart).toHaveBeenCalledWith(expect.anything(), 'tenant', 'entry', now);
    expect(produceEntryStart).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        handover: false,
        interval: { start: now, end: facts.effectiveEnd },
      })
    );
  });
});
