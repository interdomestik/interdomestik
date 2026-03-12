import type { CancellationTermsSummary } from './types';

const REFUND_WINDOW_DAYS = 30;

function addRefundWindowDays(purchasedAt: Date): Date {
  const refundWindowEndsAt = new Date(purchasedAt);
  refundWindowEndsAt.setUTCDate(refundWindowEndsAt.getUTCDate() + REFUND_WINDOW_DAYS);
  return refundWindowEndsAt;
}

export function buildCancellationTermsSummary(args: {
  purchasedAt: Date | null | undefined;
  currentPeriodEnd: Date | null | undefined;
  hasAcceptedEscalation: boolean;
  now?: Date;
}): CancellationTermsSummary {
  const now = args.now ?? new Date();
  const refundWindowEndsAt = args.purchasedAt ? addRefundWindowDays(args.purchasedAt) : null;

  let refundStatus: CancellationTermsSummary['refundStatus'] = 'outside_window';
  if (args.hasAcceptedEscalation) {
    refundStatus = 'blocked_by_accepted_escalation';
  } else if (refundWindowEndsAt && now.getTime() <= refundWindowEndsAt.getTime()) {
    refundStatus = 'eligible';
  }

  return {
    coolingOffAppliesSeparately: true,
    currentPeriodEndsAt: args.currentPeriodEnd?.toISOString() ?? null,
    effectiveFrom: 'next_billing_period',
    hasAcceptedEscalation: args.hasAcceptedEscalation,
    refundStatus,
    refundWindowEndsAt: refundWindowEndsAt?.toISOString() ?? null,
  };
}
