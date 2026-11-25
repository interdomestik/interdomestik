import { describe, expect, it } from 'vitest';
import { deriveAssignedClaimAttention } from './assigned-claim-attention';

const now = new Date('2026-09-29T12:00:00.000Z');

describe('deriveAssignedClaimAttention', () => {
  it('separates member wait from staff review and flags only a passed saved request date', () => {
    const attention = deriveAssignedClaimAttention(
      ['member-case', 'staff-case', 'no-request'],
      [
        {
          claimId: 'member-case',
          memberDueAt: new Date('2026-09-29T11:59:59.000Z'),
          hasEvidence: false,
        },
        { claimId: 'staff-case', memberDueAt: null, hasEvidence: true },
      ],
      now
    );

    expect(attention).toEqual({
      'member-case': {
        nextActor: 'member',
        overdueFollowUpDueAt: '2026-09-29T11:59:59.000Z',
      },
      'staff-case': { nextActor: 'staff', overdueFollowUpDueAt: null },
      'no-request': { nextActor: 'untracked', overdueFollowUpDueAt: null },
    });
  });

  it('keeps an exact-now request out of overdue and prioritizes staff when requests are mixed', () => {
    const attention = deriveAssignedClaimAttention(
      ['mixed', 'due-now'],
      [
        { claimId: 'due-now', memberDueAt: now, hasEvidence: false },
        {
          claimId: 'mixed',
          memberDueAt: new Date('2026-09-28T00:00:00.000Z'),
          hasEvidence: true,
        },
      ],
      now
    );
    expect(attention).toEqual({
      mixed: { nextActor: 'staff', overdueFollowUpDueAt: '2026-09-28T00:00:00.000Z' },
      'due-now': { nextActor: 'member', overdueFollowUpDueAt: null },
    });
  });
});
