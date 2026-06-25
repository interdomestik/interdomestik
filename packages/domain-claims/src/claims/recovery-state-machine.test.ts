import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import { mapRecoveryStatusToLifecycleState } from '@interdomestik/domain-recovery';
import { describe, expect, it } from 'vitest';

import { evaluateRecoveryInvariants, type RecoveryInvariantEvidence } from './recovery-invariants';
import { transitionClaimStatusInTransaction } from './transition';
import { authorizedRecoveryEvidence, makeTransitionTx } from './transition-test-support';
import { canTransition } from './transition-guard';

const actor = { id: 'staff-1', role: 'staff' };

const EXPECTED_RECOVERY_STATES = {
  draft: 'not_started',
  submitted: 'not_started',
  submitted_to_airline: 'submitted_to_airline',
  verification: 'not_started',
  evaluation: 'not_started',
  negotiation: 'negotiation',
  court: 'court',
  resolved: 'resolved',
  rejected: 'closed',
} as const satisfies Record<ClaimStatus, ReturnType<typeof mapRecoveryStatusToLifecycleState>>;

const successFeeEvidence: RecoveryInvariantEvidence = {
  ...authorizedRecoveryEvidence,
  successFeeAmount: '150.00',
  successFeeCollectionMethod: 'payment_method_charge',
  successFeeCurrencyCode: 'EUR',
  successFeeDeductionAllowed: false,
  successFeeHasStoredPaymentMethod: true,
  successFeeRecoveredAmount: '1000.00',
  successFeeResolvedAt: new Date('2026-03-13T09:00:00Z'),
  successFeeSubscriptionId: 'sub-1',
};

const noFeeEvidence: RecoveryInvariantEvidence = {
  ...authorizedRecoveryEvidence,
  noFeeDocumentedAt: new Date('2026-03-14T09:00:00Z'),
  noFeeDocumentedById: 'staff-1',
  noFeeReasonCode: 'no_recovery',
};

describe('T-205 recovery state machine transitions', () => {
  it.each(CLAIM_STATUSES)('maps %s to the authoritative recovery lifecycle state', status => {
    expect(mapRecoveryStatusToLifecycleState(status)).toBe(EXPECTED_RECOVERY_STATES[status]);
  });

  it.each([
    ['evaluation', 'negotiation', 'negotiation'],
    ['evaluation', 'submitted_to_airline', 'submitted_to_airline'],
    ['submitted_to_airline', 'negotiation', 'negotiation'],
    ['negotiation', 'court', 'court'],
    ['negotiation', 'resolved', 'resolved'],
    ['court', 'resolved', 'resolved'],
    ['court', 'rejected', 'closed'],
    ['negotiation', 'rejected', 'closed'],
  ] satisfies Array<[ClaimStatus, ClaimStatus, string]>)(
    'allows recovery edge %s -> %s and lands in %s',
    (from, to, lifecycleState) => {
      expect(
        canTransition({
          actor,
          context: { paymentAuthorizationState: 'authorized' },
          from,
          to,
        })
      ).toMatchObject({ allowed: true });
      expect(mapRecoveryStatusToLifecycleState(to)).toBe(lifecycleState);
    }
  );

  it.each([
    ['negotiation', {}, 'signed_agreement_authorization_required'],
    [
      'court',
      { ...authorizedRecoveryEvidence, legalActionCapPercentage: null },
      'legal_action_cap_required',
    ],
    ['resolved', authorizedRecoveryEvidence, 'success_fee_or_no_fee_required'],
  ] satisfies Array<[ClaimStatus, RecoveryInvariantEvidence | Record<string, never>, string]>)(
    'asserts typed recovery invariant rejection for %s',
    (toStatus, evidence, reason) => {
      const rejection = evaluateRecoveryInvariants({
        evidence: { claimId: 'claim-1', ...evidence },
        toStatus,
      });

      expect(rejection).toBe(reason);
      expect(
        canTransition({
          actor,
          context: {
            paymentAuthorizationState: 'authorized',
            recoveryInvariantRejection: rejection,
          },
          from: toStatus === 'negotiation' ? 'evaluation' : 'negotiation',
          to: toStatus,
        })
      ).toEqual({ allowed: false, reason });
    }
  );

  it.each([
    ['resolved', successFeeEvidence],
    ['resolved', noFeeEvidence],
  ] satisfies Array<[ClaimStatus, RecoveryInvariantEvidence]>)(
    'allows %s when required recovery evidence exists',
    (toStatus, evidence) => {
      expect(evaluateRecoveryInvariants({ evidence, toStatus })).toBeNull();
    }
  );

  it.each([
    ['resolved', null],
    ['negotiation', { ...authorizedRecoveryEvidence, paymentAuthorizationState: 'pending' }],
  ] satisfies Array<[ClaimStatus, RecoveryInvariantEvidence | null]>)(
    'keeps command rejection generic and side-effect free for %s',
    async (toStatus, evidence) => {
      const { calls, tx } = makeTransitionTx({
        current: { id: 'claim-1', lifecycleVersion: 1, status: 'evaluation' },
        evidence,
        updated: [{ id: 'claim-1', lifecycleVersion: 2 }],
      });

      await expect(
        transitionClaimStatusInTransaction(tx, {
          actor,
          claimId: 'claim-1',
          tenantId: 'tenant-1',
          toStatus,
        })
      ).resolves.toEqual({ success: false, error: 'transition_rejected' });
      expect(calls.updateValues).toBeUndefined();
      expect(calls.historyValues).toBeUndefined();
      expect(calls.eventValues).toBeUndefined();
    }
  );
});
