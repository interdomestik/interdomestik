import type { CancellationTermsSummary } from '@interdomestik/domain-membership-billing/subscription/types';

type TranslationFn = (key: string, values?: Record<string, string | number>) => string;

export function buildCancellationFeedbackMessage(
  t: TranslationFn,
  cancellationTerms: CancellationTermsSummary
) {
  const parts = [t('actions.cancel_requested')];

  if (cancellationTerms.currentPeriodEndsAt) {
    parts.push(
      t('actions.cancel_keeps_access_until', {
        date: new Date(cancellationTerms.currentPeriodEndsAt).toLocaleDateString(),
      })
    );
  }

  if (cancellationTerms.refundStatus === 'eligible') {
    parts.push(t('actions.refund_eligible'));
  }

  if (cancellationTerms.refundStatus === 'outside_window') {
    parts.push(t('actions.refund_window_closed'));
  }

  if (cancellationTerms.refundStatus === 'blocked_by_accepted_escalation') {
    parts.push(t('actions.accepted_escalation_survives'));
  }

  if (cancellationTerms.coolingOffAppliesSeparately) {
    parts.push(t('actions.cooling_off_applies_separately'));
  }

  return parts.join(' ');
}
