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

  it('rejects legacy rows with null lifecycle fields instead of using status fallback', async () => {
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

    expect(result).toEqual({ success: false, error: 'invalid_current_status' });
    expect(calls.updateValues).toBeUndefined();
    expect(calls.historyValues).toBeUndefined();
    expect(calls.eventValues).toBeUndefined();
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

  it('does not rewrite stale legacy status on same-status transitions', async () => {
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
    expect(calls.updateValues).toEqual({ updatedAt: expect.any(Date) });
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

describe('draft submission intake categories', () => {
  function draftCase(category: string) {
    return { id: 'claim-1', category, lifecycleVersion: 6, status: 'draft' as const };
  }

  it.each(['injury', 'invalidity', 'Personal Injury'])(
    'refuses to submit a draft with category %s',
    async category => {
      const { calls, tx } = makeTransitionTx({ current: draftCase(category) });

      await expect(transitionClaimStatusInTransaction(tx, params('submitted'))).resolves.toEqual({
        success: false,
        error: 'transition_rejected',
      });

      expect(calls.updateValues).toBeUndefined();
      expect(calls.historyValues).toBeUndefined();
      expect(calls.eventValues).toBeUndefined();
    }
  );

  it('requires the current draft row to have an open category in the submission CAS', async () => {
    const { calls, tx } = makeTransitionTx({
      current: draftCase(' VEHICLE '),
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });

    await expect(
      transitionClaimStatusInTransaction(tx, params('submitted'))
    ).resolves.toMatchObject({
      success: true,
      status: 'submitted',
    });

    expectLifecycleCas(calls.whereConditions);
    const where = inspect(calls.whereConditions.at(-1), { depth: 20 });
    expect(where).toContain('public.claim_category_open_for_intake(');
    expect(where).toContain('category');
  });

  it('moves a legacy free-text claim already submitted to verification', async () => {
    const { calls, tx } = makeTransitionTx({
      current: { ...draftCase('Personal Injury'), status: 'submitted' },
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });

    await expect(
      transitionClaimStatusInTransaction(tx, params('verification'))
    ).resolves.toMatchObject({
      success: true,
      status: 'verification',
    });

    expect(inspect(calls.whereConditions.at(-1), { depth: 20 })).not.toContain(
      'public.claim_category_open_for_intake('
    );
  });
});
