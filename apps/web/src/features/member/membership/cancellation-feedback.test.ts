import { describe, expect, it } from 'vitest';

import { buildCancellationFeedbackMessage } from './cancellation-feedback';

const t = (key: string, values?: Record<string, string | number>) =>
  values?.date ? `${key}:${values.date}` : key;

describe('buildCancellationFeedbackMessage', () => {
  it('surfaces refund eligibility and cooling-off guidance for refundable cancellations', () => {
    const message = buildCancellationFeedbackMessage(t, {
      coolingOffAppliesSeparately: true,
      currentPeriodEndsAt: '2027-03-01T00:00:00.000Z',
      effectiveFrom: 'next_billing_period',
      hasAcceptedEscalation: false,
      refundStatus: 'eligible',
      refundWindowEndsAt: '2026-03-31T00:00:00.000Z',
    });

    expect(message).toContain('actions.cancel_requested');
    expect(message).toContain('actions.cancel_keeps_access_until');
    expect(message).toContain('actions.refund_eligible');
    expect(message).toContain('actions.cooling_off_applies_separately');
  });

  it('surfaces surviving escalation terms when a recovery matter was already accepted', () => {
    const message = buildCancellationFeedbackMessage(t, {
      coolingOffAppliesSeparately: true,
      currentPeriodEndsAt: '2027-03-01T00:00:00.000Z',
      effectiveFrom: 'next_billing_period',
      hasAcceptedEscalation: true,
      refundStatus: 'blocked_by_accepted_escalation',
      refundWindowEndsAt: '2026-03-31T00:00:00.000Z',
    });

    expect(message).toContain('actions.accepted_escalation_survives');
    expect(message).toContain('actions.cooling_off_applies_separately');
  });
});
