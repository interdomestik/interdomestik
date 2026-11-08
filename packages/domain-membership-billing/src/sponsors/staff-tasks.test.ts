import { describe, expect, it, vi } from 'vitest';

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(() => {
    throw new Error('no database access expected');
  }),
}));
vi.mock('@interdomestik/database/tenant-authority', () => ({
  readTenantAuthority: () => ({ tenantId: 'tenant_ks' }),
}));

import type { SponsorActor } from './access';
import {
  acknowledgeHandoverCharge,
  activationCandidates,
  entryTasks,
  listSponsorStaffTasks,
  scheduledCancelTasks,
} from './staff-tasks';

const now = new Date('2027-06-01T00:00:00Z');
const row = (over: Record<string, unknown> = {}) => ({
  id: 'spe_1',
  termId: 'spt_1',
  sponsorId: 'spn_1',
  userId: 'usr_1',
  outcome: 'seated',
  reviewReason: null,
  conflictDecision: 'accepted',
  revokedAt: null,
  termEnd: '2028-01-01 00:00:00+00',
  terminatedEffectiveAt: null,
  ...over,
});
const actor = (role: string): SponsorActor => ({
  userId: 'usr_x',
  role,
  branchId: 'br_1',
  agentTier: 'office',
});

describe('sponsor staff-task queue', () => {
  it('derives entry review and rejected-entry tasks only while the entry can still matter', () => {
    const rows = [
      row({ id: 'a', outcome: 'staff_review', reviewReason: 'paddle_state' }),
      row({ id: 'b', conflictDecision: 'rejected', outcome: 'pending' }),
      row({ id: 'c', outcome: 'staff_review', revokedAt: '2027-05-01 00:00:00+00' }),
      row({ id: 'd', conflictDecision: 'rejected', termEnd: '2027-05-01 00:00:00+00' }),
      row({ id: 'e' }),
    ];
    expect(entryTasks(rows as never, now)).toEqual([
      expect.objectContaining({ kind: 'entry_review', entryId: 'a', reason: 'paddle_state' }),
      expect.objectContaining({ kind: 'rejected_entry', entryId: 'b' }),
    ]);
  });

  it('lists a person for activation review only 90 days after the last entry ends', () => {
    const rows = [
      row({ userId: 'old', termEnd: '2027-01-01 00:00:00+00' }),
      row({ userId: 'old', revokedAt: '2027-02-01 00:00:00+00' }),
      row({ userId: 'recent', termEnd: '2027-04-01 00:00:00+00' }),
      row({ userId: null, termEnd: '2026-01-01 00:00:00+00' }),
    ];
    expect([...activationCandidates(rows as never, now).keys()]).toEqual(['old']);
  });

  it('lists an unwanted scheduled cancel only until it takes effect', () => {
    const task = (effectiveAt: string) => ({
      kind: 'scheduled_cancel' as const,
      taskId: effectiveAt,
      intentId: 'sph_1',
      userId: 'usr_1',
      effectiveAt: new Date(effectiveAt),
    });
    expect(
      scheduledCancelTasks([task('2027-06-15T00:00:00Z'), task('2027-05-15T00:00:00Z')], now)
    ).toEqual([
      {
        kind: 'scheduled_cancel',
        intentId: 'sph_1',
        userId: 'usr_1',
        at: new Date('2027-06-15T00:00:00Z'),
      },
    ]);
  });

  it.each(['agent', 'branch_manager', 'auditor', 'global_support', 'member'])(
    'refuses %s before any read',
    async role => {
      const hasCredential = vi.fn();
      await expect(
        listSponsorStaffTasks({} as never, actor(role), { hasCredential }, now)
      ).resolves.toEqual({ ok: false, error: 'forbidden' });
      await expect(
        acknowledgeHandoverCharge({} as never, actor(role), { chargeId: 'c', now })
      ).resolves.toEqual({ ok: false, error: 'forbidden' });
      expect(hasCredential).not.toHaveBeenCalled();
    }
  );
});
