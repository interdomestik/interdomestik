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

describe('transition lifecycle CAS deprecation readiness', () => {
  it('authorizes from lifecycle state when legacy compat status is stale', async () => {
    const { calls, tx } = makeTransitionTx({
      current: {
        id: 'claim-1',
        lifecycleVersion: 6,
        status: 'draft',
        caseLifecycleState: 'evaluation',
        recoveryLifecycleState: 'not_started',
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
    expect(calls.historyValues).toEqual(
      expect.objectContaining({ fromStatus: 'evaluation', toStatus: 'negotiation' })
    );
    const updateWhere = inspect(calls.whereConditions.at(-1), { depth: 20 });
    expect(updateWhere).toContain('case_lifecycle_state');
    expect(updateWhere).toContain('recovery_lifecycle_state');
    expect(updateWhere).toContain('lifecycle_version');
    expect(updateWhere).not.toContain('claims.status');
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
      current: {
        id: 'claim-1',
        lifecycleVersion: 6,
        status: 'draft',
        caseLifecycleState: 'evaluation',
        recoveryLifecycleState: 'not_started',
      },
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
    const updateWhere = inspect(calls.whereConditions.at(-1), { depth: 20 });
    expect(updateWhere).toContain('case_lifecycle_state');
    expect(updateWhere).toContain('recovery_lifecycle_state');
    expect(updateWhere).toContain('lifecycle_version');
    expect(updateWhere).not.toContain('claims.status');
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
