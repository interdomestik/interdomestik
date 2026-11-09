import { describe, expect, it } from 'vitest';

import type { CoverageEntry } from '../sponsor-coverage/evaluate';
import type { SubscriptionRow } from '../sponsor-coverage/resolve';
import { nonSponsorGrantsAccess, planEndOffers, planRenewalNotices } from './mail-producers';

const day = (n: number): Date => new Date(Date.UTC(2027, 0, n));
function entry(overrides: Partial<CoverageEntry> = {}): CoverageEntry {
  return {
    id: 'e1',
    sponsorId: 's1',
    termId: 't1',
    termStart: day(1),
    termEnd: day(31),
    terminatedEffectiveAt: null,
    termEffective: true,
    planId: 'standard',
    planKey: 'plan',
    legalEntityId: 'entity',
    conflictDecision: 'accepted',
    revokedAt: null,
    outcome: 'seated',
    startsAt: day(1),
    handoverPaidUntil: null,
    ...overrides,
  };
}
function subscription(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  // These are the only fields read by the established lifecycle policy.
  return {
    provider: 'paddle',
    status: 'active',
    cancelAtPeriodEnd: false,
    gracePeriodEndsAt: null,
    ...overrides,
  } as SubscriptionRow;
}

describe('daily renewal plan', () => {
  it('uses the open lower and closed 30-day upper boundaries and stable keys', () => {
    expect(planRenewalNotices([entry()], day(0))).toEqual([]);
    const expected = [
      {
        rosterEntryId: 'e1',
        kind: 'renewal_notice',
        idempotencyKey: 'sponsor-entry:e1:renewal_notice:30d',
      },
    ];
    expect(planRenewalNotices([entry()], day(1))).toEqual(expected);
    expect(planRenewalNotices([entry()], day(30))).toEqual(expected);
    expect(planRenewalNotices([entry()], day(31))).toEqual([]);
  });

  it('honors termination and excludes revoked, rejected, undecided, review and ineffective entries', () => {
    expect(
      planRenewalNotices([entry({ termEnd: day(70), terminatedEffectiveAt: day(31) })], day(1))
    ).toHaveLength(1);
    for (const change of [
      { revokedAt: day(20) },
      { conflictDecision: 'rejected' },
      { conflictDecision: null },
      { outcome: 'staff_review' },
      { termEffective: false },
    ] satisfies Partial<CoverageEntry>[]) {
      expect(planRenewalNotices([entry(change)], day(1))).toEqual([]);
    }
  });

  it('recognizes contiguous successors using the effective end, not the original end', () => {
    const e = entry({ termEnd: day(70), terminatedEffectiveAt: day(31) });
    const next = entry({ id: 'e2', termStart: day(31), termEnd: day(90), startsAt: null });
    expect(planRenewalNotices([e, next], day(1))).toEqual([]);
    expect(planRenewalNotices([e, { ...next, sponsorId: 'other' }], day(1))).toHaveLength(1);
  });
});

describe('daily end-offer plan', () => {
  it('uses only the latest-ending entry per person and sponsor, independent of input order', () => {
    const old = entry({ id: 'old', termEnd: day(15) });
    const latest = entry({ id: 'latest', termStart: day(15), termEnd: day(31), startsAt: null });
    const expected = [
      {
        rosterEntryId: 'latest',
        kind: 'membership_end_offer',
        idempotencyKey: 'sponsor-entry:latest:membership_end_offer',
      },
    ];
    expect(planEndOffers({ entries: [old, latest], subscription: null }, day(31))).toEqual(
      expected
    );
    expect(planEndOffers({ entries: [latest, old], subscription: null }, day(40))).toEqual(
      expected
    );
    // Past the 30-day window nothing is produced, so a deleted outbox row is never re-queued.
    expect(planEndOffers({ entries: [latest, old], subscription: null }, day(61))).toEqual([]);
  });

  it('breaks end ties deterministically and keeps separate sponsors', () => {
    const entries = [
      entry({ id: 'a' }),
      entry({ id: 'b' }),
      entry({ id: 'c', sponsorId: 'other' }),
    ];
    expect(
      planEndOffers({ entries, subscription: null }, day(31))
        .map(mail => mail.rosterEntryId)
        .sort()
    ).toEqual(['b', 'c']);
  });

  it('suppresses offers for current or later coverage, including another sponsor', () => {
    const e = entry();
    const future = entry({
      id: 'future',
      sponsorId: 'other',
      termStart: day(40),
      termEnd: day(60),
      startsAt: day(40),
    });
    expect(planEndOffers({ entries: [e], subscription: null }, day(30))).toEqual([]);
    expect(planEndOffers({ entries: [e, future], subscription: null }, day(31))).toEqual([]);
    expect(
      planEndOffers(
        { entries: [e, { ...future, conflictDecision: 'rejected' }], subscription: null },
        day(31)
      )
    ).toHaveLength(1);
  });

  it('excludes entries never admitted but recognizes an earlier revoked end', () => {
    expect(
      planEndOffers(
        { entries: [entry({ conflictDecision: 'rejected' })], subscription: null },
        day(32)
      )
    ).toEqual([]);
    expect(
      planEndOffers({ entries: [entry({ revokedAt: day(10) })], subscription: null }, day(10))
    ).toHaveLength(1);
  });

  it('uses source-2 lifecycle access, never the sponsor reporting cache', () => {
    for (const status of ['active', 'trialing'] as const) {
      const sub = subscription({ status });
      expect(planEndOffers({ entries: [entry()], subscription: sub }, day(31))).toEqual([]);
    }
    expect(nonSponsorGrantsAccess(subscription({ provider: 'group_sponsor' }), day(31))).toBe(
      false
    );
    expect(nonSponsorGrantsAccess(subscription({ status: 'canceled' }), day(31))).toBe(false);
    expect(
      nonSponsorGrantsAccess(
        subscription({ status: 'past_due', gracePeriodEndsAt: day(32) }),
        day(31)
      )
    ).toBe(true);
    expect(
      nonSponsorGrantsAccess(
        subscription({ status: 'past_due', gracePeriodEndsAt: day(31) }),
        day(31)
      )
    ).toBe(false);
    expect(
      planEndOffers(
        { entries: [entry()], subscription: subscription({ status: 'canceled' }) },
        day(31)
      )
    ).toHaveLength(1);
  });
});
