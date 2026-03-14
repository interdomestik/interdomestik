import { describe, expect, it } from 'vitest';

import {
  buildRecoveryDecisionSnapshot,
  getRecoveryDeclineMemberDescription,
  toMemberSafeRecoveryDecision,
} from './recovery-decision';

describe('recovery decision helpers', () => {
  it('returns a pending snapshot when no explicit decision is recorded yet', () => {
    expect(buildRecoveryDecisionSnapshot(null)).toEqual({
      status: 'pending',
      decidedAt: null,
      explanation: null,
      declineReasonCode: null,
      staffLabel: 'Pending staff decision',
      memberLabel: null,
      memberDescription: null,
    });
  });

  it('maps declined decisions into staff and member-safe labels', () => {
    const snapshot = buildRecoveryDecisionSnapshot({
      decidedAt: new Date('2026-03-14T09:00:00.000Z'),
      declineReasonCode: 'insufficient_evidence',
      decisionType: 'declined',
      explanation: 'The uploaded estimates are incomplete.',
    });

    expect(snapshot).toMatchObject({
      status: 'declined',
      explanation: 'The uploaded estimates are incomplete.',
      declineReasonCode: 'insufficient_evidence',
      staffLabel: 'Insufficient evidence for staff-led recovery',
      memberLabel: 'More evidence is needed',
      memberDescription:
        'We need stronger supporting evidence before staff-led recovery can start.',
    });
    expect(toMemberSafeRecoveryDecision(snapshot)).toEqual({
      status: 'declined',
      title: 'More evidence is needed',
      description: 'We need stronger supporting evidence before staff-led recovery can start.',
    });
  });

  it('returns the member-safe decline description for the taxonomy code', () => {
    expect(getRecoveryDeclineMemberDescription('guidance_only_scope')).toBe(
      'This matter stays guidance-only or referral-only under the current launch scope.'
    );
  });
});
