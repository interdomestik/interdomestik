import { describe, expect, it } from 'vitest';

import { safePublicStatusNote, type StatusNoteDecision } from './rejected-claim-public-note';

const context = {
  fromStatus: 'rejected' as const,
  isPublic: true,
  note: 'The member committed fraud',
};

describe('rejected claim public notes', () => {
  it.each([
    {
      label: 'a sensitive decision on a rejected claim',
      fromStatus: 'rejected',
      decision: { decisionType: 'declined', declineReasonCode: 'conflict_or_integrity_concern' },
    },
    {
      label: 'a sensitive decision before the claim is rejected',
      fromStatus: 'evaluation',
      decision: { decisionType: 'declined', declineReasonCode: 'conflict_or_integrity_concern' },
    },
    {
      label: 'a declined decision with no category',
      fromStatus: 'evaluation',
      decision: { decisionType: 'declined', declineReasonCode: null },
    },
    {
      label: 'a missing decision on a rejected claim',
      fromStatus: 'rejected',
      decision: undefined,
    },
  ] as const)('keeps $label generic', ({ fromStatus, decision }) => {
    expect(safePublicStatusNote({ ...context, fromStatus }, decision)).toBe(
      'We cannot accept this matter for staff-led recovery.'
    );
  });

  it('keeps a public follow-up note for a non-sensitive decline', () => {
    const decision: StatusNoteDecision = {
      decisionType: 'declined',
      declineReasonCode: 'insufficient_evidence',
    };
    expect(safePublicStatusNote({ ...context, note: '  More documents needed  ' }, decision)).toBe(
      'More documents needed'
    );
  });

  it('does not alter a private staff note', () => {
    expect(safePublicStatusNote({ ...context, isPublic: false }, undefined)).toBe(context.note);
  });
});
