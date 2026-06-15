import { describe, expect, it } from 'vitest';

import {
  BREAK_GLASS_AUDIT_EVENT,
  canApproveGovernanceAction,
  validateBreakGlassContext,
} from './governance';
import { ROLES } from './permissions';

describe('governance role boundaries', () => {
  it('blocks technical super admin from fee, payment, and terms approvals', () => {
    for (const actorRole of [ROLES.super_admin, ROLES.global_support, ROLES.auditor]) {
      expect(
        canApproveGovernanceAction({
          actorRole,
          actorUserId: 'actor-1',
          requestedByUserId: 'requester-1',
        })
      ).toBe(false);
    }
  });

  it('requires separation of duties for governance approvals', () => {
    expect(
      canApproveGovernanceAction({
        actorRole: ROLES.tenant_admin,
        actorUserId: 'user-1',
        requestedByUserId: 'user-1',
      })
    ).toBe(false);
    expect(
      canApproveGovernanceAction({
        actorRole: ROLES.tenant_admin,
        actorUserId: 'approver-1',
        requestedByUserId: 'requester-1',
      })
    ).toBe(true);
  });

  it('requires reason and future expiry for break-glass audit evidence', () => {
    const now = new Date('2026-06-14T10:00:00.000Z');

    expect(
      validateBreakGlassContext({
        reason: '   ',
        expiresAt: new Date('2026-06-14T11:00:00.000Z'),
        now,
      })
    ).toEqual({ success: false, error: 'reason_required' });
    expect(
      validateBreakGlassContext({
        reason: 'Investigate production access incident',
        expiresAt: new Date('2026-06-14T09:59:59.000Z'),
        now,
      })
    ).toEqual({ success: false, error: 'expiry_not_future' });
  });

  it('returns security break-glass audit metadata when valid', () => {
    expect(
      validateBreakGlassContext({
        reason: ' Investigate production access incident ',
        expiresAt: new Date('2026-06-14T11:00:00.000Z'),
        now: new Date('2026-06-14T10:00:00.000Z'),
        reviewerUserId: 'reviewer-1',
      })
    ).toEqual({
      success: true,
      auditEvent: BREAK_GLASS_AUDIT_EVENT,
      metadata: {
        reason: 'Investigate production access incident',
        expiresAt: '2026-06-14T11:00:00.000Z',
        reviewerUserId: 'reviewer-1',
      },
    });
  });
});
