import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { admitPersonEntries } from '../sponsor-coverage/admission';
import { produceEntryStart } from '../sponsor-coverage/entry-start';
import { readPersonCoverage } from '../sponsor-coverage/resolve';
import { auditTransaction } from './audit-test-support';
import { provisionEntry } from './provisioning';
import { mark, review, setStart } from './provisioning-effects';
import { readProvisioningFacts, type ProvisioningEntryFacts } from './provisioning-facts';
import { linkHandoverIntent } from './provisioning-intent';

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(),
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

function use(status: string, termStart = facts.termStart): void {
  const db = auditTransaction({
    selects: [
      [{ role: 'member' }],
      [{ id: 'subscription', provider: 'paddle', status, providerSubscriptionId: 'provider' }],
    ],
  });
  vi.mocked(withTenantAuthority).mockImplementation(async (_authority, fn) => fn(db.tx));
  vi.mocked(readProvisioningFacts).mockResolvedValue({ ...facts, termStart });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(admitPersonEntries).mockResolvedValue([{ entryId: 'entry', decision: 'accepted' }]);
  vi.mocked(readPersonCoverage).mockResolvedValue(null);
  vi.mocked(produceEntryStart).mockResolvedValue({
    outcome: 'seated',
    reviewReason: null,
    mails: [],
  });
});

describe('provisionEntry case effects', () => {
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

  it('publishes a linked paid-end interval with the credential snapshot', async () => {
    use('active');
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
    expect(setStart).not.toHaveBeenCalled();
  });

  it('preserves immediate fallback after a handover can no longer collect', async () => {
    use('active');
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
