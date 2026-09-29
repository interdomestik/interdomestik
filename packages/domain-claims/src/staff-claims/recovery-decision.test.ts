import { describe, expect, it } from 'vitest';

import {
  buildRecoveryDecisionSnapshot,
  getRecoveryDeclineMemberDescription,
  getRecoveryDeclinePublicNote,
  toMemberSafeRecoveryDecision,
} from './recovery-decision';
import {
  selectPublicDeclineNote,
  toMemberDeclineReasonCode,
} from './recovery-decision-public-copy';

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
      declineReasonCode: 'insufficient_evidence',
    });
  });

  it('does not disclose an integrity category or staff explanation in the member projection', () => {
    const snapshot = buildRecoveryDecisionSnapshot({
      decisionType: 'declined',
      declineReasonCode: 'conflict_or_integrity_concern',
      explanation: 'Private allegation requiring human review',
    });
    const member = toMemberSafeRecoveryDecision(snapshot);

    expect(member).toEqual({
      status: 'declined',
      title: 'Cannot accept for staff-led recovery',
      description: 'We cannot accept this matter for staff-led recovery.',
      declineReasonCode: 'other',
    });
    expect(JSON.stringify(member)).not.toContain('Private allegation');
    expect(JSON.stringify(member)).not.toContain('conflict_or_integrity_concern');
  });

  it('does not assert a definitive legal deadline for a time-limit concern', () => {
    expect(getRecoveryDeclineMemberDescription('time_limit_risk')).toBe(
      'A time-limit concern prevents staff-led recovery based on the information currently available.'
    );
  });

  it('forces a generic public note for a sensitive decline and trims an ordinary note', () => {
    expect(toMemberDeclineReasonCode('conflict_or_integrity_concern')).toBe('other');
    expect(
      getRecoveryDeclinePublicNote('conflict_or_integrity_concern', 'The member committed fraud')
    ).toBe('We cannot accept this matter for staff-led recovery.');
    expect(
      selectPublicDeclineNote(
        'conflict_or_integrity_concern',
        'Private allegation',
        'A decision was made after staff review.'
      )
    ).toBe('A decision was made after staff review.');
    expect(
      selectPublicDeclineNote('insufficient_evidence', '  More documents needed  ', 'Default')
    ).toBe('More documents needed');
    expect(selectPublicDeclineNote('insufficient_evidence', '   ', 'Default')).toBe('Default');
  });

  it('returns the member-safe decline description for the taxonomy code', () => {
    expect(getRecoveryDeclineMemberDescription('guidance_only_scope')).toBe(
      'This matter stays guidance-only or referral-only under the current launch scope.'
    );
  });
});
