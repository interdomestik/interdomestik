import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  type AuthorizedTransitionHookTx,
  transitionClaimStatusInTransaction,
  type TransitionClaimStatusParams,
  type TransitionTx,
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

describe('transitionClaimStatusInTransaction authorized hook', () => {
  it('types the pre-persist hook with transaction operations only', () => {
    type HookHasTransaction = AuthorizedTransitionHookTx extends { transaction: unknown }
      ? true
      : false;

    expectTypeOf<HookHasTransaction>().toEqualTypeOf<false>();
    expectTypeOf<AuthorizedTransitionHookTx>().toMatchTypeOf<
      Pick<TransitionTx, 'insert' | 'select' | 'update'>
    >();
  });

  it('runs after recovery prerequisite locks and before the claim CAS using narrowed tx ops', async () => {
    const { calls, tx } = makeTransitionTx({
      current: { id: 'claim-1', lifecycleVersion: 6, status: 'evaluation' },
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });

    await transitionClaimStatusInTransaction(
      tx,
      makeParams({
        beforePersistAuthorized: async hookTx => {
          expect('execute' in hookTx).toBe(false);
          expect('transaction' in hookTx).toBe(false);
          calls.operations.push('hook:authorized');
        },
      })
    );

    expect(calls.operations.slice(0, 5)).toEqual([
      'lock:agreement',
      'lock:no-fee',
      'select:current',
      'hook:authorized',
      'update:claim',
    ]);
    expect(calls.operations.indexOf('insert:history')).toBeGreaterThan(
      calls.operations.indexOf('update:claim')
    );
  });

  it('does not run when the transition guard rejects', async () => {
    let hookRan = false;
    const { calls, tx } = makeTransitionTx({
      current: { id: 'claim-1', lifecycleVersion: 6, status: 'evaluation' },
      evidence: { ...authorizedRecoveryEvidence, paymentAuthorizationState: 'pending' },
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });

    const result = await transitionClaimStatusInTransaction(
      tx,
      makeParams({
        beforePersistAuthorized: async () => {
          hookRan = true;
        },
      })
    );

    expect(result).toEqual({ success: false, error: 'transition_rejected' });
    expect(hookRan).toBe(false);
    expect(calls.updateValues).toBeUndefined();
    expect(calls.historyValues).toBeUndefined();
    expect(calls.eventValues).toBeUndefined();
  });

  it('does not persist status, history, or transition events when it fails', async () => {
    const { calls, tx } = makeTransitionTx({
      current: { id: 'claim-1', lifecycleVersion: 6, status: 'evaluation' },
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });

    const transition = transitionClaimStatusInTransaction(
      tx,
      makeParams({
        beforePersistAuthorized: async () => {
          throw new Error('recovery decision write failed');
        },
      })
    );

    await expect(transition).rejects.toThrow('recovery decision write failed');
    expect(calls.updateValues).toBeUndefined();
    expect(calls.historyValues).toBeUndefined();
    expect(calls.eventValues).toBeUndefined();
  });
});
