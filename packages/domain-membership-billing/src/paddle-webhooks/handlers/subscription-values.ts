import type { InternalSubscriptionStatus } from '../subscription-status';

const SUBSCRIPTION_EVENT_STATUSES = new Set([
  'active',
  'past_due',
  'paused',
  'canceled',
  'trialing',
  'expired',
]);

export type CanonicalMembershipPlanState = {
  planId: string;
  planKey: string | null;
};

export type ExistingSubscription = {
  id: string;
  status?: string | null;
  tenantId?: string | null;
  userId?: string | null;
};

export function assertSubscriptionMatchesContext(
  subscription: ExistingSubscription,
  context: { subId: string; tenantId: string; userId: string }
) {
  if (!subscription.tenantId || subscription.tenantId !== context.tenantId) {
    throw new Error(
      `Paddle subscription ${context.subId} tenant conflict: existing=${subscription.tenantId} resolved=${context.tenantId}`
    );
  }
  if (!subscription.userId || subscription.userId !== context.userId) {
    throw new Error(
      `Paddle subscription ${context.subId} user conflict: existing=${subscription.userId} resolved=${context.userId}`
    );
  }
}

export function normalizeExistingStatus(
  status: ExistingSubscription['status']
): InternalSubscriptionStatus | 'none' {
  if (typeof status !== 'string') return 'none';
  const normalized = status.trim();
  return SUBSCRIPTION_EVENT_STATUSES.has(normalized)
    ? (normalized as InternalSubscriptionStatus)
    : 'none';
}

export function mapToSubscriptionValues(
  sub: any,
  mappedStatus: InternalSubscriptionStatus,
  planState: CanonicalMembershipPlanState
) {
  const currentStartsAt =
    sub.currentBillingPeriod?.startsAt || sub.current_billing_period?.starts_at;
  const currentEndsAt = sub.currentBillingPeriod?.endsAt || sub.current_billing_period?.ends_at;
  const baseValues = {
    status: mappedStatus,
    ...createCanonicalMembershipPlanState(planState.planId, planState.planKey),
    providerCustomerId: (sub.customerId || sub.customer_id) as string | null,
    currentPeriodStart: parseDate(currentStartsAt),
    currentPeriodEnd: parseDate(currentEndsAt),
    cancelAtPeriodEnd:
      sub.scheduledChange?.action === 'cancel' || sub.scheduled_change?.action === 'cancel',
    canceledAt: mappedStatus === 'canceled' ? new Date() : null,
    updatedAt: new Date(),
  };

  if (mappedStatus === 'active') {
    Object.assign(baseValues, {
      pastDueAt: null,
      gracePeriodEndsAt: null,
      dunningAttemptCount: 0,
      lastDunningAt: null,
    });
  }

  return baseValues;
}

export function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

function createCanonicalMembershipPlanState(planId: string, planKey?: string | null) {
  return {
    planId,
    ...(planKey ? { planKey } : {}),
  };
}

function parseDate(dateStr: string | undefined | null): Date | null {
  return dateStr ? new Date(dateStr) : null;
}
