import { describe, expect, it, vi } from 'vitest';
import { sponsorHandoverIntents, sponsorRosterEntries } from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { auditTransaction } from './audit-test-support';
import { readHandoverState, type HandoverState } from './handover-intent-read';
import { planHandoverStep } from './handover-plan';

vi.mock('./handover-worker', () => ({ lockPerson: vi.fn() }));
vi.mock('./handover-intent-read', () => ({ readHandoverState: vi.fn() }));

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(() => {
    throw new Error('no database access expected');
  }),
}));

import type { SponsorActor } from './access';
import {
  closeHandoverByStaff,
  readBackAllowsClosure,
  recordHandoverEvidence,
} from './handover-staff';
import type { HandoverSubscription } from './paddle-handover-client';

const readBack = (over: Partial<HandoverSubscription>): HandoverSubscription => ({
  status: 'active',
  scheduledChange: null,
  currentBillingPeriod: null,
  nextBilledAt: null,
  ...over,
});
const actor = (role: string): SponsorActor => ({
  userId: 'usr_staff',
  role,
  branchId: null,
  agentTier: null,
});
const now = new Date('2027-01-10T00:00:00Z');

describe('staff handover actions', () => {
  it('needs a matching Paddle read-back for each disposition', () => {
    expect(readBackAllowsClosure('canceled', readBack({ status: 'canceled' }))).toBe(true);
    expect(readBackAllowsClosure('canceled', readBack({}))).toBe(false);
    expect(readBackAllowsClosure('renewing_as_member', readBack({}))).toBe(true);
    expect(
      readBackAllowsClosure(
        'renewing_as_member',
        readBack({ scheduledChange: { action: 'cancel' } })
      )
    ).toBe(false);
    expect(readBackAllowsClosure('renewing_as_member', readBack({ status: 'past_due' }))).toBe(
      false
    );
  });

  it.each(['agent', 'branch_manager', 'auditor', 'global_support', 'member'])(
    'refuses %s before any read or Paddle call',
    async role => {
      const client = { getSubscription: vi.fn() };
      const authority = {} as never;
      await expect(
        closeHandoverByStaff(authority, actor(role), client, {
          intentId: 'sph_1',
          disposition: 'canceled',
          now,
        })
      ).resolves.toEqual({ ok: false, error: 'forbidden' });
      await expect(
        recordHandoverEvidence(
          authority,
          actor(role),
          { hasCredential: async () => false },
          { intentId: 'sph_1', paidUntil: now, evidenceId: 'txn_123', now }
        )
      ).resolves.toEqual({ ok: false, error: 'forbidden' });
      expect(client.getSubscription).not.toHaveBeenCalled();
    }
  );

  it('rejects a malformed evidence id or date before any read', async () => {
    const record = (evidenceId: string, paidUntil: Date) =>
      recordHandoverEvidence(
        {} as never,
        actor('staff'),
        { hasCredential: async () => false },
        { intentId: 'sph_1', paidUntil, evidenceId, now }
      );
    await expect(record('x', now)).resolves.toEqual({ ok: false, error: 'invalid' });
    await expect(record('has space', now)).resolves.toEqual({ ok: false, error: 'invalid' });
    await expect(record('txn_123', new Date(Number.NaN))).resolves.toEqual({
      ok: false,
      error: 'invalid',
    });
  });
});

it('accepts unique staff evidence after canceled-without-evidence and keeps paidUntil write-once', async () => {
  const state: HandoverState = {
    intent: {
      id: 'intent',
      userId: 'member',
      providerSubscriptionId: 'sub_1',
      state: 'pending',
      cancelDispatchedAt: '2027-01-01',
      dispatchPeriodEndsAt: '2027-01-15',
      staffDisposition: null,
      restorationCutoff: null,
      attempts: 1,
      paidUntil: null,
      paidUntilEvidence: null,
      nextAttemptAt: null,
      canceledConfirmedAt: null,
      reconciliationClosedAt: null,
    },
    attempts: [{ id: 'attempt', attemptNo: 1, outcome: 'unknown' }],
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
  };
  const plan = planHandoverStep(state, readBack({ status: 'canceled' }), [], now);
  if (!plan.nextState) throw new Error('Expected a recovery state');
  state.intent.state = plan.nextState;
  state.intent.canceledConfirmedAt = now.toISOString();
  vi.mocked(readHandoverState).mockResolvedValue(state);
  const db = auditTransaction({
    selects: [[{ userId: 'member', providerSubscriptionId: 'sub_1' }], []],
  });
  vi.mocked(withTenantAuthority).mockImplementationOnce(async (_authority, callback) =>
    callback(db.tx)
  );
  const input = {
    intentId: 'intent',
    paidUntil: new Date('2027-01-15'),
    evidenceId: 'support:123',
    now,
  };
  const record = () =>
    recordHandoverEvidence(
      mintTestTenantAuthority('tenant'),
      actor('staff'),
      { hasCredential: async () => true },
      input
    );
  await expect(record()).resolves.toEqual({ ok: true, value: { started: 1 } });
  expect(
    db.writes.filter(write => write.table === sponsorHandoverIntents).map(write => write.values)
  ).toContainEqual(
    expect.objectContaining({
      paidUntilEvidence: 'staff:support:123',
      paidUntil: input.paidUntil.toISOString(),
    })
  );
  expect(
    db.writes.filter(write => write.table === sponsorRosterEntries).map(write => write.values)
  ).toContainEqual({ outcome: 'seated', reviewReason: null });
  state.intent.paidUntil = input.paidUntil.toISOString();
  const second = auditTransaction({
    selects: [[{ userId: 'member', providerSubscriptionId: 'sub_1' }]],
  });
  vi.mocked(withTenantAuthority).mockImplementationOnce(async (_authority, callback) =>
    callback(second.tx)
  );
  await expect(record()).resolves.toEqual({ ok: false, error: 'conflict' });
  expect(second.writes).toEqual([]);
});
