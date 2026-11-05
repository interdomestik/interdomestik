import { describe, expect, it } from 'vitest';

import {
  authorizeClaimTransitionInTransaction,
  type TransitionClaimStatusParams,
  writeAuthorizedTransitionStatus,
} from './transition';
import { authorizedRecoveryEvidence, makeTransitionTx } from './transition-test-support';

type Params = TransitionClaimStatusParams;
function makeParams(overrides: Partial<Params> = {}): Params {
  return {
    actor: { id: 'staff-1', role: 'staff' },
    claimId: 'claim-1',
    tenantId: 'tenant-1',
    toStatus: 'negotiation',
    ...overrides,
  };
}

// The staff decline record runs between authorization and the status write, on the same
// transaction: authorization locks the recovery prerequisites, then the caller writes.
describe('authorized pre-write phase', () => {
  it('authorizes after recovery prerequisite locks and leaves the claim CAS to the caller', async () => {
    const { calls, tx } = makeTransitionTx({
      current: { id: 'claim-1', lifecycleVersion: 6, status: 'evaluation' },
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });

    const authorized = await authorizeClaimTransitionInTransaction(tx, makeParams());
    if (!authorized.success) throw new Error('expected an authorized transition');
    calls.operations.push('prewrite:authorized');
    await writeAuthorizedTransitionStatus(tx, authorized.transition);

    expect(calls.operations.slice(0, 5)).toEqual([
      'select:current',
      'lock:agreement',
      'lock:no-fee',
      'prewrite:authorized',
      'update:claim',
    ]);
    expect(calls.historyValues).toBeUndefined();
  });

  it('returns no authorization when the transition guard rejects', async () => {
    const { calls, tx } = makeTransitionTx({
      current: { id: 'claim-1', lifecycleVersion: 6, status: 'evaluation' },
      evidence: { ...authorizedRecoveryEvidence, paymentAuthorizationState: 'pending' },
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });

    const result = await authorizeClaimTransitionInTransaction(tx, makeParams());

    expect(result).toEqual({ success: false, error: 'transition_rejected' });
    expect(calls.updateValues).toBeUndefined();
    expect(calls.historyValues).toBeUndefined();
    expect(calls.eventValues).toBeUndefined();
  });

  it('refuses a status write whose proof does not match the current state', async () => {
    const { calls, tx } = makeTransitionTx({
      current: { id: 'claim-1', lifecycleVersion: 6, status: 'evaluation' },
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });
    const authorized = await authorizeClaimTransitionInTransaction(tx, makeParams());
    if (!authorized.success) throw new Error('expected an authorized transition');

    const forged = {
      ...authorized.transition,
      current: { ...authorized.transition.current, status: 'verification' as const },
    };

    await expect(writeAuthorizedTransitionStatus(tx, forged)).rejects.toThrow(
      'mismatched authorization proof'
    );
    expect(calls.updateValues).toBeUndefined();
  });
});
