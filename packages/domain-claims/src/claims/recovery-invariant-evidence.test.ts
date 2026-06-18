import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';

import { loadRecoveryInvariantReadRow } from './recovery-invariant-evidence';
import type { TransitionTx } from './transition-side-effects';

describe('loadRecoveryInvariantReadRow', () => {
  it('loads current claim and evidence in one tenant-scoped query', async () => {
    const calls: { joins: unknown[]; where?: unknown } = { joins: [] };
    const row = {
      claimId: 'claim-1',
      lifecycleVersion: 4,
      noFeeDocumentedAt: new Date('2026-03-14T09:00:00Z'),
      noFeeDocumentedById: 'staff-1',
      noFeeReasonCode: 'no_recovery',
      status: 'negotiation',
    };
    const tx = {
      select: () => ({
        from: () => ({
          leftJoin: (_table: unknown, condition: unknown) => {
            calls.joins.push(condition);
            return tx.select().from();
          },
          where: (condition: unknown) => {
            calls.where = condition;
            return { limit: async () => [row] };
          },
        }),
      }),
    };

    await expect(
      loadRecoveryInvariantReadRow(tx as unknown as TransitionTx, {
        readWhere: { tenantId: 'tenant-1', claimId: 'claim-1' } as never,
        tenantId: 'tenant-1',
      })
    ).resolves.toEqual({
      current: { lifecycleVersion: 4, status: 'negotiation' },
      evidence: row,
    });

    const joinedPredicates = inspect(calls.joins, { depth: 20 });
    const wherePredicate = inspect(calls.where, { depth: 20 });
    expect(joinedPredicates).toContain('claim_escalation_agreements');
    expect(joinedPredicates).toContain('claim_recovery_no_fee_evidence');
    expect(joinedPredicates).toContain('tenant-1');
    expect(wherePredicate).toContain('tenant-1');
    expect(wherePredicate).toContain('claim-1');
  });
});
