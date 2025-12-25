import { describe, expect, it } from 'vitest';

import { ENGAGEMENT_CADENCE, getDayWindow } from './engagement-schedule';

describe('engagement-schedule', () => {
  it('defines the expected cadence days', () => {
    expect(ENGAGEMENT_CADENCE.map(c => c.daysSinceSubscriptionCreated)).toEqual([
      7, 14, 30, 60, 90,
    ]);
  });

  it('computes a stable day window', () => {
    const now = new Date('2025-12-25T12:34:56.000Z');
    const { start, end } = getDayWindow(now, 7);

    expect(start.toISOString()).toBe('2025-12-18T00:00:00.000Z');
    expect(end.toISOString()).toBe('2025-12-19T00:00:00.000Z');
  });
});
