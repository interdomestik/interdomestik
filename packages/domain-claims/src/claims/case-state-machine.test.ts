import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import { mapCaseStatusToLifecycleState } from '@interdomestik/domain-case';
import { describe, expect, it } from 'vitest';

import {
  ALLOWED_CLAIM_STATUS_TRANSITIONS,
  canTransition,
  isClaimStatusTransitionInGraph,
} from './transition-guard';

const actor = { id: 'staff-1', role: 'staff' };

const EXPECTED_CASE_STATES = {
  draft: 'draft',
  submitted: 'submitted',
  submitted_to_airline: 'recovery',
  verification: 'verification',
  evaluation: 'evaluation',
  negotiation: 'recovery',
  court: 'recovery',
  resolved: 'resolved',
  rejected: 'rejected',
} as const satisfies Record<ClaimStatus, ReturnType<typeof mapCaseStatusToLifecycleState>>;

const EXPECTED_GRAPH = {
  draft: ['submitted'],
  submitted: ['verification', 'evaluation', 'rejected', 'submitted_to_airline'],
  submitted_to_airline: ['negotiation', 'resolved', 'evaluation', 'rejected'],
  verification: ['evaluation', 'submitted'],
  evaluation: ['negotiation', 'submitted_to_airline', 'verification', 'rejected', 'resolved'],
  negotiation: ['court', 'resolved', 'evaluation', 'rejected'],
  court: ['resolved', 'rejected', 'negotiation'],
  resolved: ['evaluation', 'negotiation'],
  rejected: ['evaluation', 'submitted'],
} as const satisfies Record<ClaimStatus, readonly ClaimStatus[]>;

function transitionIsAllowed(from: ClaimStatus, to: ClaimStatus): boolean {
  return from === to || (EXPECTED_GRAPH[from] as readonly ClaimStatus[]).includes(to);
}

const allPairs = CLAIM_STATUSES.flatMap(from => CLAIM_STATUSES.map(to => [from, to] as const));
const allowedPairs = allPairs.filter(([from, to]) => transitionIsAllowed(from, to));
const rejectedPairs = allPairs.filter(([from, to]) => !transitionIsAllowed(from, to));

describe('T-205 case state machine transitions', () => {
  it('pins the explicit case transition graph', () => {
    expect(ALLOWED_CLAIM_STATUS_TRANSITIONS).toEqual(EXPECTED_GRAPH);
  });

  it.each(CLAIM_STATUSES)('maps %s to the authoritative case lifecycle state', status => {
    expect(mapCaseStatusToLifecycleState(status)).toBe(EXPECTED_CASE_STATES[status]);
  });

  it.each(allowedPairs)('allows case edge %s -> %s', (from, to) => {
    const decision = canTransition({
      actor,
      context: { paymentAuthorizationState: 'authorized' },
      from,
      to,
    });

    expect(isClaimStatusTransitionInGraph(from, to)).toBe(true);
    expect(mapCaseStatusToLifecycleState(to)).toBe(EXPECTED_CASE_STATES[to]);
    expect(decision).toMatchObject({ allowed: true });
    if (decision.allowed)
      expect(decision.authorization).toMatchObject({ actorId: actor.id, from, to });
  });

  it.each(rejectedPairs)('rejects illegal case edge %s -> %s with a typed reason', (from, to) => {
    expect(isClaimStatusTransitionInGraph(from, to)).toBe(false);
    expect(
      canTransition({
        actor,
        context: { paymentAuthorizationState: 'authorized' },
        from,
        to,
      })
    ).toEqual({ allowed: false, reason: 'illegal_transition' });
  });

  it('rejects invalid runtime statuses with a typed reason', () => {
    expect(
      canTransition({
        actor,
        from: 'not-a-status' as ClaimStatus,
        to: 'submitted',
      })
    ).toEqual({ allowed: false, reason: 'invalid_status' });
  });
});
