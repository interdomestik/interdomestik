import type { ClaimStatus } from '@interdomestik/database/constants';
import { describe, expect, it } from 'vitest';

import { canTransition, isClaimStatusTransitionInGraph } from './transition-guard';

const actor = { id: 'staff-1', role: 'staff' };

describe('canTransition', () => {
  it('allows valid graph transitions when payment is authorized', () => {
    expect(
      canTransition({
        actor,
        context: { paymentAuthorizationState: 'authorized' },
        from: 'evaluation',
        to: 'negotiation',
      })
    ).toMatchObject({ allowed: true });
  });

  // T-002d: an allowed decision carries the branded proof, bound to the
  // actor and the exact from/to statuses it was minted for.
  it('mints an authorization proof bound to actor and statuses on allow', () => {
    const decision = canTransition({
      actor,
      context: { paymentAuthorizationState: 'authorized' },
      from: 'evaluation',
      to: 'negotiation',
    });
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.authorization).toMatchObject({
        actorId: 'staff-1',
        from: 'evaluation',
        to: 'negotiation',
      });
    }
  });

  it('does not expose an authorization on rejected decisions', () => {
    const decision = canTransition({ actor, from: 'draft', to: 'resolved' });
    expect(decision.allowed).toBe(false);
    expect('authorization' in decision).toBe(false);
  });

  it.each([
    ['draft', 'resolved'],
    ['resolved', 'draft'],
  ] satisfies Array<[ClaimStatus, ClaimStatus]>)('rejects illegal %s to %s jumps', (from, to) => {
    expect(
      canTransition({
        actor,
        context: { paymentAuthorizationState: 'authorized' },
        from,
        to,
      })
    ).toEqual({ allowed: false, reason: 'illegal_transition' });
  });

  it('keeps same-status graph transitions available', () => {
    expect(isClaimStatusTransitionInGraph('evaluation', 'evaluation')).toBe(true);
    expect(canTransition({ actor, from: 'evaluation', to: 'evaluation' })).toMatchObject({
      allowed: true,
    });
  });

  it.each(['negotiation', 'court'] satisfies ClaimStatus[])(
    'rejects %s without signed authorized recovery evidence',
    to => {
      expect(
        canTransition({
          actor,
          context: { paymentAuthorizationState: 'pending' },
          from: to === 'court' ? 'negotiation' : 'evaluation',
          to,
        })
      ).toEqual({ allowed: false, reason: 'signed_agreement_authorization_required' });
    }
  );

  it.each([undefined, null, 'revoked'] as const)(
    'rejects recovery when payment authorization is %s',
    paymentAuthorizationState => {
      expect(
        canTransition({
          actor,
          context: { paymentAuthorizationState },
          from: 'negotiation',
          to: 'court',
        })
      ).toEqual({ allowed: false, reason: 'signed_agreement_authorization_required' });
    }
  );

  it('rejects explicit central recovery invariant failures', () => {
    expect(
      canTransition({
        actor,
        context: {
          paymentAuthorizationState: 'authorized',
          recoveryInvariantRejection: 'legal_action_cap_required',
        },
        from: 'negotiation',
        to: 'court',
      })
    ).toEqual({ allowed: false, reason: 'legal_action_cap_required' });
  });

  it('allows non-recovery transitions without payment authorization', () => {
    expect(
      canTransition({
        actor,
        context: { paymentAuthorizationState: 'pending' },
        from: 'submitted',
        to: 'verification',
      })
    ).toMatchObject({ allowed: true });
  });
});
