import { describe, expect, it } from 'vitest';

import { buildCancellationTermsSummary } from './cancellation-policy';

describe('buildCancellationTermsSummary', () => {
  it('marks the membership fee as refundable when purchase is within 30 days and no escalation was accepted', () => {
    const summary = buildCancellationTermsSummary({
      purchasedAt: new Date('2026-03-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2027-03-01T00:00:00.000Z'),
      hasAcceptedEscalation: false,
      now: new Date('2026-03-12T00:00:00.000Z'),
    });

    expect(summary).toEqual({
      coolingOffAppliesSeparately: true,
      currentPeriodEndsAt: '2027-03-01T00:00:00.000Z',
      effectiveFrom: 'next_billing_period',
      hasAcceptedEscalation: false,
      refundStatus: 'eligible',
      refundWindowEndsAt: '2026-03-31T00:00:00.000Z',
    });
  });

  it('blocks the membership-fee refund when an escalation has already been accepted', () => {
    const summary = buildCancellationTermsSummary({
      purchasedAt: new Date('2026-03-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2027-03-01T00:00:00.000Z'),
      hasAcceptedEscalation: true,
      now: new Date('2026-03-12T00:00:00.000Z'),
    });

    expect(summary.refundStatus).toBe('blocked_by_accepted_escalation');
    expect(summary.hasAcceptedEscalation).toBe(true);
    expect(summary.coolingOffAppliesSeparately).toBe(true);
  });

  it('marks the refund window as expired after 30 days even without an accepted escalation', () => {
    const summary = buildCancellationTermsSummary({
      purchasedAt: new Date('2026-01-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2027-01-01T00:00:00.000Z'),
      hasAcceptedEscalation: false,
      now: new Date('2026-03-12T00:00:00.000Z'),
    });

    expect(summary.refundStatus).toBe('outside_window');
    expect(summary.refundWindowEndsAt).toBe('2026-01-31T00:00:00.000Z');
  });
});
