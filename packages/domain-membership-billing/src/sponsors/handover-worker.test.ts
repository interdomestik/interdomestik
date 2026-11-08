import {
  sponsorHandoverCancelAttempts,
  sponsorHandoverIntents,
  sponsorMailOutbox,
  sponsorRosterEntries,
} from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auditTransaction } from './audit-test-support';
import { readHandoverState, type HandoverState } from './handover-intent-read';
import { runHandoverIntent } from './handover-worker';
import type { HandoverPaddleClient, HandoverSubscription } from './paddle-handover-client';

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(),
}));
vi.mock('@interdomestik/database/sponsor-locks', () => ({ lockSponsorPerson: vi.fn() }));
vi.mock('./handover-intent-read', () => ({ readHandoverState: vi.fn(), listDueIntents: vi.fn() }));

const now = new Date('2027-01-10T00:00:00Z');
const authority = mintTestTenantAuthority('tenant');
const subscription: HandoverSubscription = {
  status: 'active',
  scheduledChange: null,
  nextBilledAt: '2027-01-15T00:00:00Z',
  currentBillingPeriod: { startsAt: '2026-12-15T00:00:00Z', endsAt: '2027-01-15T00:00:00Z' },
};
function state(): HandoverState {
  return {
    intent: {
      id: 'intent',
      userId: 'member',
      providerSubscriptionId: 'sub_1',
      state: 'pending',
      staffDisposition: null,
      cancelDispatchedAt: null,
      dispatchPeriodEndsAt: null,
      restorationCutoff: null,
      attempts: 0,
      paidUntil: null,
      paidUntilEvidence: null,
      canceledConfirmedAt: null,
      reconciliationClosedAt: null,
    },
    linked: [
      {
        id: 'entry',
        sponsorId: 'sponsor',
        termId: 'term',
        termStart: new Date('2027-01-01'),
        termEnd: new Date('2028-01-01'),
        terminatedEffectiveAt: null,
        termEffective: true,
        planId: 'standard',
        planKey: 'plan',
        legalEntityId: 'ks',
        conflictDecision: 'accepted',
        revokedAt: null,
        outcome: 'awaiting_paid_end',
        startsAt: null,
        handoverPaidUntil: null,
      },
    ],
    attempts: [],
  };
}
function setup(after: HandoverSubscription) {
  const db = auditTransaction();
  vi.mocked(withTenantAuthority).mockImplementation(async (_authority, callback) =>
    callback(db.tx)
  );
  const initial = state();
  const dispatched = state();
  dispatched.intent.cancelDispatchedAt = now.toISOString();
  dispatched.intent.dispatchPeriodEndsAt = subscription.nextBilledAt;
  dispatched.intent.attempts = 1;
  dispatched.attempts = [{ id: 'attempt', attemptNo: 1, outcome: 'unknown' }];
  vi.mocked(readHandoverState)
    .mockResolvedValueOnce(initial)
    .mockResolvedValueOnce(initial)
    .mockResolvedValue(dispatched);
  const client: HandoverPaddleClient = {
    getSubscription: vi.fn().mockResolvedValueOnce(subscription).mockResolvedValue(after),
    listTransactions: vi
      .fn()
      .mockResolvedValue([
        { id: 'txn_1', status: 'paid', billingPeriod: { startsAt: '2026-12-15T00:00:00Z' } },
      ]),
    cancelAtNextPeriod: vi.fn().mockResolvedValue({ kind: 'indeterminate' }),
  };
  return { db, client, dispatched };
}
beforeEach(() => vi.resetAllMocks());

describe('handover post-cancel observation', () => {
  it('publishes paid evidence and starts entries in the same run even after a timeout', async () => {
    const { db, client } = setup({
      ...subscription,
      scheduledChange: { action: 'cancel', effectiveAt: '2027-01-15T00:00:00Z' },
    });
    await expect(
      runHandoverIntent(
        authority,
        { client, hasCredential: async () => true },
        { intentId: 'intent', now }
      )
    ).resolves.toBe('dispatched');
    expect(client.getSubscription).toHaveBeenCalledTimes(2);
    expect(client.listTransactions).toHaveBeenCalledTimes(2);
    expect(client.cancelAtNextPeriod).toHaveBeenCalledTimes(1);
    expect(db.writes).toContainEqual({
      table: sponsorHandoverIntents,
      values: expect.objectContaining({
        paidUntil: '2027-01-15T00:00:00Z',
        paidUntilEvidence: 'txn_1',
      }),
    });
    expect(
      db.writes.filter(write => write.table === sponsorRosterEntries).map(write => write.values)
    ).toContainEqual({ outcome: 'seated', reviewReason: null });
    expect(db.audits()).toContainEqual(
      expect.objectContaining({
        action: 'sponsor_entry.started',
        metadata: { at: '2027-01-15T00:00:00.000Z' },
      })
    );
  });

  it('records cancellation, moots unknown attempts and queues recovery without inventing evidence', async () => {
    const { db, client } = setup({
      ...subscription,
      status: 'canceled',
      currentBillingPeriod: null,
    });
    await runHandoverIntent(
      authority,
      { client, hasCredential: async () => true },
      { intentId: 'intent', now }
    );
    expect(
      db.writes.filter(write => write.table === sponsorHandoverIntents).map(write => write.values)
    ).toContainEqual(
      expect.objectContaining({ state: 'staff_review', canceledConfirmedAt: now.toISOString() })
    );
    expect(
      db.writes
        .filter(write => write.table === sponsorHandoverCancelAttempts)
        .map(write => write.values)
    ).toContainEqual(expect.objectContaining({ outcome: 'moot' }));
    expect(
      db.writes.filter(write => write.table === sponsorMailOutbox).map(write => write.values)
    ).toContainEqual(expect.objectContaining({ kind: 'membership_end_offer' }));
    expect(
      db.writes.some(write => write.table === sponsorHandoverIntents && 'paidUntil' in write.values)
    ).toBe(false);
  });

  it('never dispatches twice when the post-cancel read is still unscheduled', async () => {
    const { db, client } = setup(subscription);
    await runHandoverIntent(
      authority,
      { client, hasCredential: async () => true },
      { intentId: 'intent', now }
    );
    expect(client.getSubscription).toHaveBeenCalledTimes(2);
    expect(client.cancelAtNextPeriod).toHaveBeenCalledTimes(1);
    expect(
      db.writes.filter(
        write => write.table === sponsorHandoverIntents && 'attempts' in write.values
      )
    ).toHaveLength(1);
    // The next retry backs off by the attempts already made (one): ten minutes, not five.
    expect(db.writes.at(-1)?.values).toMatchObject({
      nextAttemptAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
    });
  });

  it('discards a scan read before another worker moved the intent, and writes nothing', async () => {
    const { db, client, dispatched } = setup(subscription);
    dispatched.intent.state = 'done';
    dispatched.intent.paidUntil = '2027-01-15T00:00:00Z';
    dispatched.intent.canceledConfirmedAt = now.toISOString();
    vi.mocked(readHandoverState)
      .mockReset()
      .mockResolvedValueOnce(state())
      .mockResolvedValue(dispatched);
    vi.mocked(client.listTransactions).mockResolvedValue([]);
    await expect(
      runHandoverIntent(
        authority,
        { client, hasCredential: async () => true },
        { intentId: 'intent', now }
      )
    ).resolves.toBe('observed');
    expect(client.cancelAtNextPeriod).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });

  it('rechecks locked state after staff closes during the provider call', async () => {
    const { db, client, dispatched } = setup({
      ...subscription,
      scheduledChange: { action: 'cancel', effectiveAt: '2027-01-15T00:00:00Z' },
    });
    dispatched.intent.state = 'closed_by_staff';
    dispatched.intent.staffDisposition = 'renewing_as_member';
    await runHandoverIntent(
      authority,
      { client, hasCredential: async () => true },
      { intentId: 'intent', now }
    );
    expect(client.getSubscription).toHaveBeenCalledTimes(2);
    expect(db.audits()).toContainEqual(
      expect.objectContaining({
        action: 'sponsor_intent.scheduled_cancel',
        metadata: { effectiveAt: '2027-01-15T00:00:00.000Z' },
      })
    );
    expect(
      db.writes.some(write => write.table === sponsorHandoverIntents && 'paidUntil' in write.values)
    ).toBe(false);
  });
});
