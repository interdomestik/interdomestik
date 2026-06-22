import { inspect } from 'node:util';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { describe, expect, it } from 'vitest';

import { ClaimTransitionConflictError, transitionClaimStatusInTransaction } from './transition';
import { makeTransitionTx } from './transition-test-support';

function params(toStatus: ClaimStatus = 'negotiation') {
  return {
    actor: { id: 'staff-1', role: 'staff' },
    claimId: 'claim-1',
    tenantId: 'tenant-1',
    toStatus,
  };
}

function staleEvaluationClaim() {
  return {
    id: 'claim-1',
    lifecycleVersion: 6,
    status: 'draft' as const,
    caseLifecycleState: 'evaluation',
    recoveryLifecycleState: 'not_started',
  };
}

function expectLifecycleCas(whereConditions: unknown[]) {
  const updateWhere = inspect(whereConditions.at(-1), { depth: 20 });
  for (const column of ['case_lifecycle_state', 'recovery_lifecycle_state', 'lifecycle_version']) {
    expect(updateWhere).toContain(column);
  }
  expect(updateWhere).not.toContain('claims.status');
}

function expectLegacyStatusFallbackCas(whereConditions: unknown[]) {
  const updateWhere = inspect(whereConditions.at(-1), { depth: 20 });
  for (const column of ['case_lifecycle_state', 'recovery_lifecycle_state', 'lifecycle_version']) {
    expect(updateWhere).toContain(column);
  }
  expect(updateWhere).toContain("name: 'status'");
}

describe('transition lifecycle CAS deprecation readiness', () => {
  it('authorizes from lifecycle state when legacy compat status is stale', async () => {
    const { calls, tx } = makeTransitionTx({
      current: staleEvaluationClaim(),
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });

    const result = await transitionClaimStatusInTransaction(tx, params());

    expect(result).toEqual({
      success: true,
      fromStatus: 'evaluation',
      lifecycleVersion: 7,
      status: 'negotiation',
    });
    expect(calls.historyValues).toEqual(
      expect.objectContaining({ fromStatus: 'evaluation', toStatus: 'negotiation' })
    );
    expectLifecycleCas(calls.whereConditions);
  });

  it('transitions legacy rows with null lifecycle fields from compat status fallback', async () => {
    const { calls, tx } = makeTransitionTx({
      current: {
        id: 'claim-1',
        lifecycleVersion: 6,
        status: 'evaluation',
        caseLifecycleState: null,
        recoveryLifecycleState: null,
      },
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });

    const result = await transitionClaimStatusInTransaction(tx, params());

    expect(result).toEqual({
      success: true,
      fromStatus: 'evaluation',
      lifecycleVersion: 7,
      status: 'negotiation',
    });
    expectLegacyStatusFallbackCas(calls.whereConditions);
  });

  it('rejects from lifecycle state even when legacy compat status would permit', async () => {
    const { calls, tx } = makeTransitionTx({
      current: {
        id: 'claim-1',
        lifecycleVersion: 6,
        status: 'evaluation',
        caseLifecycleState: 'draft',
        recoveryLifecycleState: 'not_started',
      },
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });

    const result = await transitionClaimStatusInTransaction(tx, params('resolved'));

    expect(result).toEqual({ success: false, error: 'transition_rejected' });
    expect(calls.updateValues).toBeUndefined();
    expect(calls.historyValues).toBeUndefined();
    expect(calls.eventValues).toBeUndefined();
  });

  it('repairs stale legacy status on same-status transitions under lifecycle CAS', async () => {
    const { calls, tx } = makeTransitionTx({
      current: staleEvaluationClaim(),
      updated: [{ id: 'claim-1', lifecycleVersion: 6 }],
    });

    const result = await transitionClaimStatusInTransaction(tx, params('evaluation'));

    expect(result).toEqual({
      success: true,
      fromStatus: 'evaluation',
      lifecycleVersion: 6,
      status: 'evaluation',
    });
    expect(calls.updateValues).toEqual({
      status: 'evaluation',
      updatedAt: expect.any(Date),
    });
    expectLifecycleCas(calls.whereConditions);
  });

  it('fails stale lifecycle-pair CAS before history or events are recorded', async () => {
    const { calls, tx } = makeTransitionTx({
      current: {
        id: 'claim-1',
        lifecycleVersion: 6,
        status: 'evaluation',
        caseLifecycleState: 'evaluation',
        recoveryLifecycleState: 'not_started',
      },
      updated: [],
    });

    await expect(transitionClaimStatusInTransaction(tx, params())).rejects.toThrow(
      ClaimTransitionConflictError
    );
    expect(calls.historyValues).toBeUndefined();
    expect(calls.eventValues).toBeUndefined();
  });
});
