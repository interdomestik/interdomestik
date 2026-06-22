import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';

import { loadRecoveryInvariantReadRow } from './recovery-invariant-evidence';
import type { TransitionTx } from './transition-side-effects';

describe('loadRecoveryInvariantReadRow', () => {
  it('locks recovery prerequisite rows in order before loading the current claim', async () => {
    const calls: { executedSql: string[]; where?: unknown } = { executedSql: [] };
    const agreement = {
      legalActionCapPercentage: 25,
      paymentAuthorizationState: 'authorized',
      signedAt: new Date('2026-03-11T09:00:00Z'),
      successFeeAmount: '150.00',
      successFeeCollectionMethod: 'payment_method_charge',
      successFeeCurrencyCode: 'EUR',
      successFeeHasStoredPaymentMethod: true,
      successFeeResolvedAt: new Date('2026-03-13T09:00:00Z'),
    };
    const noFee = {
      noFeeDocumentedAt: new Date('2026-03-14T09:00:00Z'),
      noFeeDocumentedById: 'staff-1',
      noFeeReasonCode: 'no_recovery',
    };
    const current = {
      caseLifecycleState: 'recovery',
      lifecycleVersion: 4,
      recoveryLifecycleState: 'negotiation',
      status: 'negotiation',
    };
    const tx = {
      execute: async (query: unknown) => {
        const rendered = inspect(query, { depth: 20 });
        calls.executedSql.push(rendered);
        return rendered.includes('claim_escalation_agreements') ? [agreement] : [noFee];
      },
      select: () => ({
        from: () => ({
          where: (condition: unknown) => {
            calls.where = condition;
            return { limit: async () => [current] };
          },
        }),
      }),
    };

    await expect(
      loadRecoveryInvariantReadRow(tx as unknown as TransitionTx, {
        claimId: 'claim-1',
        readWhere: { tenantId: 'tenant-1', claimId: 'claim-1' } as never,
        tenantId: 'tenant-1',
      })
    ).resolves.toEqual({
      current: {
        caseLifecycleState: 'recovery',
        lifecycleVersion: 4,
        recoveryLifecycleState: 'negotiation',
        status: 'negotiation',
      },
      evidence: { claimId: 'claim-1', ...agreement, ...noFee },
    });

    expect(calls.executedSql).toHaveLength(2);
    expect(calls.executedSql[0]).toContain('claim_escalation_agreements');
    expect(calls.executedSql[0].toLowerCase()).toContain('for update');
    expect(calls.executedSql[0].toLowerCase()).toContain('order by');
    expect(calls.executedSql[0]).toContain('updated_at');
    expect(calls.executedSql[0]).toContain('tenant-1');
    expect(calls.executedSql[0]).toContain('claim-1');
    expect(calls.executedSql[1]).toContain('claim_recovery_no_fee_evidence');
    expect(calls.executedSql[1].toLowerCase()).toContain('for update');
    expect(calls.executedSql[1].toLowerCase()).toContain('order by');
    expect(calls.executedSql[1]).toContain('updated_at');
    expect(calls.executedSql[1]).toContain('tenant-1');
    expect(calls.executedSql[1]).toContain('claim-1');
    const wherePredicate = inspect(calls.where, { depth: 20 });
    expect(wherePredicate).toContain('tenant-1');
    expect(wherePredicate).toContain('claim-1');
  });
});
