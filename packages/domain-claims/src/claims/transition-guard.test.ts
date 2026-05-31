import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import { describe, expect, it } from 'vitest';

import { canTransition } from './transition-guard';

const actor = { id: 'staff-1', role: 'staff' };

describe('canTransition', () => {
  it('allows every current claim status transition when payment is authorized', () => {
    for (const from of CLAIM_STATUSES) {
      for (const to of CLAIM_STATUSES) {
        expect(
          canTransition({
            actor,
            context: { paymentAuthorizationState: 'authorized' },
            from,
            to,
          })
        ).toEqual({ allowed: true });
      }
    }
  });

  it.each(['negotiation', 'court'] satisfies ClaimStatus[])(
    'rejects %s without payment authorization',
    to => {
      expect(
        canTransition({
          actor,
          context: { paymentAuthorizationState: 'pending' },
          from: 'evaluation',
          to,
        })
      ).toEqual({ allowed: false, reason: 'payment_authorization_required' });
    }
  );

  it.each([undefined, null, 'revoked'] as const)(
    'rejects recovery when payment authorization is %s',
    paymentAuthorizationState => {
      expect(
        canTransition({
          actor,
          context: { paymentAuthorizationState },
          from: 'evaluation',
          to: 'court',
        })
      ).toEqual({ allowed: false, reason: 'payment_authorization_required' });
    }
  );

  it('allows recovery when staff recovery prerequisites are already satisfied', () => {
    expect(
      canTransition({
        actor,
        context: {
          paymentAuthorizationState: 'revoked',
          staffRecoveryPrerequisitesSatisfied: true,
        },
        from: 'evaluation',
        to: 'negotiation',
      })
    ).toEqual({ allowed: true });
  });

  it('does not let non-staff actors use staff recovery prerequisite context', () => {
    expect(
      canTransition({
        actor: { id: 'agent-1', role: 'agent' },
        context: {
          paymentAuthorizationState: 'revoked',
          staffRecoveryPrerequisitesSatisfied: true,
        },
        from: 'evaluation',
        to: 'negotiation',
      })
    ).toEqual({ allowed: false, reason: 'payment_authorization_required' });
  });

  it('allows non-recovery transitions without payment authorization', () => {
    expect(
      canTransition({
        actor,
        context: { paymentAuthorizationState: 'pending' },
        from: 'submitted',
        to: 'verification',
      })
    ).toEqual({ allowed: true });
  });
});
