import { describe, expect, it } from 'vitest';

import { mailFinishValues } from './mail-outbox';

import type { CoverageEntry } from '../sponsor-coverage/evaluate';
import { checkSponsorMail, hasContinuingSuccessor, type SponsorMailFacts } from './mail-checks';

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
function facts(e = entry(), overrides: Partial<SponsorMailFacts> = {}): SponsorMailFacts {
  return {
    entry: e,
    entries: [e],
    userId: 'u1',
    userExists: true,
    hasRecipient: true,
    entryExists: true,
    entryRevoked: e.revokedAt !== null,
    termEffective: e.termEffective,
    optedOut: false,
    intentAddressed: false,
    dispatchPeriodEndsAt: day(2),
    hasCredential: false,
    nonSponsorCovered: false,
    ...overrides,
  };
}
const coverageKinds = ['sponsor_notice', 'handover_confirmed', 'activation'] as const;

describe('coverage-claiming mail', () => {
  it.each(coverageKinds)('%s rechecks binding, eligibility, interval and end', kind => {
    expect(checkSponsorMail(kind, facts(), day(2))).toEqual({ send: true });
    for (const change of [
      { conflictDecision: null },
      { conflictDecision: 'rejected' },
      { revokedAt: day(3) },
      { outcome: 'staff_review' },
      { termEffective: false },
      { startsAt: null },
      { startsAt: day(31) },
      { terminatedEffectiveAt: day(1) },
    ] satisfies Partial<CoverageEntry>[]) {
      expect(checkSponsorMail(kind, facts(entry(change)), day(2)).send).toBe(false);
    }
    expect(checkSponsorMail(kind, facts(entry(), { userId: null }), day(2)).send).toBe(false);
    expect(checkSponsorMail(kind, facts(entry(), { userExists: false }), day(2)).send).toBe(false);
    expect(checkSponsorMail(kind, facts(), day(31))).toEqual({
      send: false,
      reason: 'entry_ended',
    });
  });

  it('allows advance handover confirmation but delays notice and activation until the derived start', () => {
    const f = facts(entry({ startsAt: null, handoverPaidUntil: day(10) }));
    expect(checkSponsorMail('handover_confirmed', f, day(9)).send).toBe(true);
    for (const kind of ['sponsor_notice', 'activation'] as const) {
      expect(checkSponsorMail(kind, f, day(9))).toEqual({ send: false, reason: 'before_start' });
      expect(checkSponsorMail(kind, f, day(10)).send).toBe(true);
    }
    expect(checkSponsorMail('activation', { ...f, hasCredential: true }, day(10))).toEqual({
      send: false,
      reason: 'credential_exists',
    });
  });

  it('derives continuity with all entries and clamps stored starts to term start', () => {
    const later = entry({ id: 'e2', termStart: day(31), termEnd: day(60), startsAt: null });
    const f = facts(later, { entries: [later, entry()] });
    expect(checkSponsorMail('sponsor_notice', f, day(31)).send).toBe(true);
    expect(
      checkSponsorMail('sponsor_notice', facts(entry({ startsAt: day(-5) })), day(0)).send
    ).toBe(false);
  });
});

describe('kind-specific send checks', () => {
  it('checks pending handovers against durable dispatch period and the strict term boundary', () => {
    const e = entry({ startsAt: null });
    expect(checkSponsorMail('handover_pending', facts(e), day(3)).send).toBe(true);
    expect(
      checkSponsorMail('handover_pending', facts(e, { dispatchPeriodEndsAt: null }), day(3))
    ).toEqual({ send: false, reason: 'dispatch_period_unknown' });
    for (const end of [day(31), day(35)]) {
      expect(
        checkSponsorMail('handover_pending', facts(e, { dispatchPeriodEndsAt: end }), day(3)).send
      ).toBe(false);
    }
    expect(
      checkSponsorMail('handover_pending', facts(entry({ termStart: day(31) })), day(3)).send
    ).toBe(false);
    expect(checkSponsorMail('handover_pending', facts(), day(31)).send).toBe(false);
    expect(
      checkSponsorMail('handover_pending', facts(entry({ outcome: 'staff_review' })), day(3)).send
    ).toBe(false);
  });

  it('rechecks a continuing successor without requiring its starts_at or a seated outcome', () => {
    const next = entry({
      id: 'e2',
      termStart: day(31),
      termEnd: day(60),
      startsAt: null,
      outcome: 'pending',
    });
    expect(
      checkSponsorMail('renewal_notice', facts(entry(), { entries: [entry(), next] }), day(3))
    ).toEqual({ send: false, reason: 'successor_exists' });
    for (const change of [
      { sponsorId: 'other' },
      { termStart: day(32) },
      { termEffective: false },
      { conflictDecision: 'rejected' },
      { revokedAt: day(4) },
      { terminatedEffectiveAt: day(31) },
      // The resolver excludes a successor in staff review, so the predecessor's notice is sent.
      { outcome: 'staff_review' },
    ] satisfies Partial<CoverageEntry>[]) {
      expect(hasContinuingSuccessor(entry(), [entry(), { ...next, ...change }])).toBe(false);
    }
    expect(
      checkSponsorMail('renewal_notice', facts(entry({ revokedAt: day(2) })), day(3)).send
    ).toBe(false);
    expect(
      checkSponsorMail('renewal_notice', facts(entry(), { entry: null, userId: null }), day(3)).send
    ).toBe(true);
  });

  it('offers only after the final end, with no present/future sponsor or non-sponsor access', () => {
    const f = facts();
    expect(checkSponsorMail('membership_end_offer', f, day(30)).send).toBe(false);
    expect(checkSponsorMail('membership_end_offer', f, day(31)).send).toBe(true);
    const future = entry({ id: 'e2', startsAt: day(40), termStart: day(40), termEnd: day(60) });
    expect(
      checkSponsorMail('membership_end_offer', { ...f, entries: [entry(), future] }, day(35)).send
    ).toBe(false);
    expect(
      checkSponsorMail('membership_end_offer', { ...f, nonSponsorCovered: true }, day(35)).send
    ).toBe(false);
    expect(
      checkSponsorMail(
        'membership_end_offer',
        { ...f, entries: [entry(), { ...future, conflictDecision: 'rejected' }] },
        day(35)
      ).send
    ).toBe(true);
  });

  it('intent offers survive roster deletion but require the tenant user and absence of access', () => {
    const f = facts(entry(), {
      entry: null,
      entries: [],
      entryExists: false,
      intentAddressed: true,
    });
    expect(checkSponsorMail('membership_end_offer', f, day(10)).send).toBe(true);
    expect(
      checkSponsorMail('membership_end_offer', { ...f, userExists: false }, day(10)).send
    ).toBe(false);
    expect(
      checkSponsorMail('membership_end_offer', { ...f, entries: [entry()] }, day(10)).send
    ).toBe(false);
    expect(
      checkSponsorMail('membership_end_offer', { ...f, nonSponsorCovered: true }, day(10)).send
    ).toBe(false);
  });

  it('retains opt-out confirmation after revocation, and suppresses missing recipients', () => {
    expect(
      checkSponsorMail(
        'opt_out_confirmation',
        facts(entry({ revokedAt: day(2) }), { optedOut: true }),
        day(3)
      ).send
    ).toBe(true);
    expect(
      checkSponsorMail('opt_out_confirmation', facts(entry(), { hasRecipient: false }), day(3)).send
    ).toBe(false);
    expect(
      checkSponsorMail('opt_out_confirmation', facts(entry(), { entryExists: false }), day(3)).send
    ).toBe(false);
  });

  it.each(['foreign_account', 'not_eligible'] as const)(
    '%s needs an effective term and no opt-out',
    kind => {
      const f = facts(entry(), { entry: null, userId: null });
      expect(checkSponsorMail(kind, f, day(3)).send).toBe(true);
      expect(checkSponsorMail(kind, { ...f, optedOut: true }, day(3)).send).toBe(false);
      expect(checkSponsorMail(kind, { ...f, termEffective: false }, day(3)).send).toBe(false);
    }
  );
});

describe('mail completion policy', () => {
  const now = day(1);
  it('backs off 15 minutes doubling to a day and stops on failure eight', () => {
    for (const [attempts, minutes] of [
      [1, 15],
      [2, 30],
      [7, 960],
    ]) {
      expect(
        mailFinishValues(attempts, { state: 'error', code: 'send_failed' }, now)
      ).toMatchObject({
        state: 'queued',
        terminalAt: null,
        nextAttemptAt: new Date(now.getTime() + minutes * 60_000).toISOString(),
      });
    }
    expect(mailFinishValues(8, { state: 'error', code: 'send_failed' }, now)).toEqual({
      state: 'failed',
      terminalAt: now.toISOString(),
      leaseUntil: null,
      lastErrorCode: 'send_failed',
    });
    expect(mailFinishValues(1, { state: 'skipped', reason: 'entry_revoked' }, now)).toMatchObject({
      state: 'skipped',
      terminalAt: now.toISOString(),
      lastErrorCode: 'entry_revoked',
    });
  });
});
