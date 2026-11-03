import { createCanonicalMembershipPlanState } from '../../annual-membership';
import { subscriptionEventDataSchema } from '../schemas';
import type { ExistingSubscriptionRecord, PastDueUserRecord } from './dunning-context';

export type SubscriptionEventData = ReturnType<typeof subscriptionEventDataSchema.parse>;
export type PastDueValues = {
  tenantId: string;
  userId: string;
  status: 'past_due';
  planId: string;
  planKey?: string;
  providerSubscriptionId: string;
  providerCustomerId: string | null | undefined;
  pastDueAt: Date;
  gracePeriodEndsAt: Date;
  dunningAttemptCount: number;
  lastDunningAt: Date;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  updatedAt: Date;
};

export const DUNNING_GRACE_PERIOD_DAYS = 14;

export function parsePastDueSubscription(data: unknown): SubscriptionEventData | null {
  const parseResult = subscriptionEventDataSchema.safeParse(data);
  if (!parseResult.success) {
    console.error('[Webhook] Invalid dunning data:', parseResult.error);
    return null;
  }

  return parseResult.data;
}

export function buildPastDueState(args: {
  sub: SubscriptionEventData;
  userId: string;
  userRecord: PastDueUserRecord;
  existingSub: ExistingSubscriptionRecord;
  now: Date;
  planState: {
    planId: string;
    planKey: string | null;
  };
}): { values: PastDueValues; gracePeriodEnd: Date; newDunningCount: number } {
  const gracePeriodEnd = args.existingSub?.gracePeriodEndsAt ?? calculateGracePeriodEnd(args.now);
  const newDunningCount = (args.existingSub?.dunningAttemptCount ?? 0) + 1;

  return {
    gracePeriodEnd,
    newDunningCount,
    values: {
      tenantId: args.userRecord.tenantId,
      userId: args.userId,
      status: 'past_due',
      ...createCanonicalMembershipPlanState(args.planState.planId, args.planState.planKey),
      providerSubscriptionId: args.sub.id,
      providerCustomerId: args.sub.customerId || args.sub.customer_id,
      pastDueAt: args.existingSub?.pastDueAt ?? args.now,
      gracePeriodEndsAt: gracePeriodEnd,
      dunningAttemptCount: newDunningCount,
      lastDunningAt: args.now,
      currentPeriodStart: resolveBillingPeriodDate(
        args.sub.currentBillingPeriod?.startsAt,
        args.sub.current_billing_period?.starts_at as string | null | undefined
      ),
      currentPeriodEnd: resolveBillingPeriodDate(
        args.sub.currentBillingPeriod?.endsAt,
        args.sub.current_billing_period?.ends_at as string | null | undefined
      ),
      updatedAt: args.now,
    },
  };
}

function calculateGracePeriodEnd(now: Date): Date {
  const gracePeriodEnd = new Date(now);
  gracePeriodEnd.setDate(now.getDate() + DUNNING_GRACE_PERIOD_DAYS);
  return gracePeriodEnd;
}

export function resolveBillingPeriodDate(
  primary?: string | null,
  fallback?: string | null
): Date | null {
  const rawValue = primary || fallback;
  return rawValue ? new Date(rawValue) : null;
}
