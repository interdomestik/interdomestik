import { describe, expect, it } from 'vitest';
import type { ClaimStatus } from '@interdomestik/database/constants';

import { transitionClaimStatusInTransaction } from './transition';
import { authorizedRecoveryEvidence, makeTransitionTx } from './transition-test-support';
import type { TransitionEvidenceProof } from './transition-evidence';

const actor = { id: 'staff-1', role: 'staff' };

const airlineProofs: TransitionEvidenceProof[] = [
  { id: 'assignment-1', evidenceType: 'assignment_signed', evidenceStatus: 'signed' },
  {
    id: 'airline-consent-1',
    evidenceType: 'airline_submission_consent',
    evidenceStatus: 'accepted',
  },
];

function params(toStatus: ClaimStatus = 'submitted_to_airline') {
  return { actor, claimId: 'claim-1', tenantId: 'tenant-1', toStatus };
}

describe('T-002b transition evidence invariants', () => {
  it.each([
    ['assignment_or_poa_required', []],
    ['accepted_fee_required', airlineProofs],
    ['airline_submission_consent_required', [airlineProofs[0]]],
  ] as const)('rejects airline submission for %s before side effects', async (_reason, proofs) => {
    const evidence =
      _reason === 'accepted_fee_required'
        ? { ...authorizedRecoveryEvidence, acceptedAt: null }
        : authorizedRecoveryEvidence;
    const { calls, tx } = makeTransitionTx({
      current: { id: 'claim-1', lifecycleVersion: 6, status: 'evaluation' },
      evidence,
      transitionEvidence: proofs,
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });

    await expect(transitionClaimStatusInTransaction(tx, params())).resolves.toEqual({
      success: false,
      error: 'transition_rejected',
    });
    expect(calls.operations.slice(0, 4)).toEqual([
      'lock:agreement',
      'lock:no-fee',
      'select:current',
      'lock:transition-evidence',
    ]);
    expect(calls.updateValues).toBeUndefined();
    expect(calls.historyValues).toBeUndefined();
    expect(calls.eventValues).toBeUndefined();
  });

  it('persists airline submission with evidence references only', async () => {
    const { calls, tx } = makeTransitionTx({
      current: { id: 'claim-1', lifecycleVersion: 6, status: 'evaluation' },
      transitionEvidence: airlineProofs,
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });

    await expect(transitionClaimStatusInTransaction(tx, params())).resolves.toMatchObject({
      success: true,
      fromStatus: 'evaluation',
      status: 'submitted_to_airline',
    });
    expect(calls.eventValues).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          evidenceCount: 2,
          evidenceIds: ['airline-consent-1', 'assignment-1'],
          toStatus: 'submitted_to_airline',
        }),
      })
    );
    expect(calls.eventValues).not.toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ documentBody: expect.anything() }),
      })
    );
  });

  it('requires valuation delta and service consent for vehicle-damage negotiation', async () => {
    const { calls, tx } = makeTransitionTx({
      current: { category: 'vehicle', id: 'claim-1', lifecycleVersion: 6, status: 'evaluation' },
      transitionEvidence: [
        { id: 'valuation-1', evidenceType: 'vehicle_valuation_delta', evidenceStatus: 'reviewed' },
      ],
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });

    await expect(transitionClaimStatusInTransaction(tx, params('negotiation'))).resolves.toEqual({
      success: false,
      error: 'transition_rejected',
    });
    expect(calls.updateValues).toBeUndefined();
  });

  it('requires medical consent and human review for invalidity recovery transitions', async () => {
    const { calls, tx } = makeTransitionTx({
      current: { category: 'invalidity', id: 'claim-1', lifecycleVersion: 6, status: 'evaluation' },
      transitionEvidence: [
        { id: 'medical-1', evidenceType: 'medical_consent', evidenceStatus: 'accepted' },
      ],
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });

    await expect(transitionClaimStatusInTransaction(tx, params('negotiation'))).resolves.toEqual({
      success: false,
      error: 'transition_rejected',
    });
    expect(calls.updateValues).toBeUndefined();
  });

  it('does not require medical consent for non-recovery injury transitions', async () => {
    const { calls, tx } = makeTransitionTx({
      current: { category: 'injury', id: 'claim-1', lifecycleVersion: 6, status: 'submitted' },
      transitionEvidence: [],
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });

    await expect(transitionClaimStatusInTransaction(tx, params('verification'))).resolves.toEqual(
      expect.objectContaining({ success: true, status: 'verification' })
    );
    expect(calls.updateValues).toEqual(expect.objectContaining({ status: 'verification' }));
  });
});
