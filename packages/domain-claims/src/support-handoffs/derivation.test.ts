import { describe, expect, it } from 'vitest';

import { deriveSupportHandoffSignals, getDaysInStage } from './derivation';

describe('support handoff signal derivation', () => {
  const now = new Date('2026-05-03T12:00:00.000Z');

  it('uses low-risk defaults when the handoff is not linked to a claim', () => {
    expect(deriveSupportHandoffSignals({ claim: null, now })).toEqual({
      trustRisk: 'low',
      urgency: 'normal',
    });
  });

  it('marks unassigned staff-required claims as critical high-risk handoffs', () => {
    expect(
      deriveSupportHandoffSignals({
        claim: {
          createdAt: '2026-05-03T09:00:00.000Z',
          staffId: null,
          status: 'submitted',
          statusUpdatedAt: '2026-05-03T09:00:00.000Z',
          updatedAt: '2026-05-03T09:00:00.000Z',
        },
        now,
      })
    ).toEqual({
      trustRisk: 'high',
      urgency: 'critical',
    });
  });

  it('treats member-action and terminal states as informational', () => {
    expect(
      deriveSupportHandoffSignals({
        claim: {
          createdAt: '2026-04-01T00:00:00.000Z',
          staffId: 'staff-1',
          status: 'verification',
          statusUpdatedAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
        now,
      })
    ).toEqual({
      trustRisk: 'informational',
      urgency: 'low',
    });

    expect(
      deriveSupportHandoffSignals({
        claim: {
          createdAt: '2026-04-01T00:00:00.000Z',
          staffId: 'staff-1',
          status: 'resolved',
          statusUpdatedAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
        now,
      })
    ).toEqual({
      trustRisk: 'informational',
      urgency: 'low',
    });
  });

  it('anchors days-in-stage to status update before generic update time', () => {
    expect(
      getDaysInStage({
        createdAt: '2026-04-01T00:00:00.000Z',
        now,
        statusUpdatedAt: '2026-05-01T12:00:00.000Z',
        updatedAt: '2026-04-15T00:00:00.000Z',
      })
    ).toBe(2);
  });
});
