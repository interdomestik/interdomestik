import { describe, expect, it, vi } from 'vitest';

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
