import { describe, expect, it } from 'vitest';

import { getClaimStatus } from './get-claim-status';

describe('getClaimStatus', () => {
  it('returns deterministic default for empty timeline', () => {
    const result = getClaimStatus([]);

    expect(result).toEqual({
      status: 'draft',
      lastTransitionAt: null,
    });
  });

  it('ignores unknown event types and projects from known status events', () => {
    const result = getClaimStatus([
      {
        id: 'e3',
        claimId: 'claim-1',
        type: 'note_added',
        fromStatus: null,
        toStatus: null,
        createdAt: '2026-01-03T00:00:00.000Z',
      },
      {
        id: 'e2',
        claimId: 'claim-1',
        type: 'status_changed',
        fromStatus: 'submitted',
        toStatus: 'in_review',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'e1',
        claimId: 'claim-1',
        type: 'status_changed',
        fromStatus: 'draft',
        toStatus: 'submitted',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    expect(result).toEqual({
      status: 'in_review',
      lastTransitionAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('returns deterministic status for same ordered timeline input', () => {
    const events = [
      {
        id: 'e2',
        claimId: 'claim-1',
        type: 'status_changed',
        fromStatus: 'submitted',
        toStatus: 'in_review',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'e1',
        claimId: 'claim-1',
        type: 'status_changed',
        fromStatus: 'draft',
        toStatus: 'submitted',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const first = getClaimStatus(events);
    const second = getClaimStatus(events);

    expect(first).toEqual(second);
    expect(first).toEqual({
      status: 'in_review',
      lastTransitionAt: '2026-01-02T00:00:00.000Z',
    });
  });
});
