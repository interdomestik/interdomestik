import { and, db, eq, subscriptions } from '@interdomestik/database';

/**
 * Checks if a user has an active membership that grants access to benefits.
 * Allowed statuses:
 * - 'active'
 * - 'trialing'
 * - 'past_due' (ONLY if still within grace period)
 *
 * @param userId - The user ID to check
 * @param tenantId - Required tenant ID for multi-tenant isolation
 */
export async function hasActiveMembership(
  userId: string,
  tenantId: string | null | undefined
): Promise<boolean> {
  if (!tenantId) {
    throw new Error('tenantId is required for membership lookup');
  }
  const sub = await db.query.subscriptions.findFirst({
    where: and(eq(subscriptions.userId, userId), eq(subscriptions.tenantId, tenantId)),
  });

  if (!sub) return false;

  if (sub.status === 'active' || sub.status === 'trialing') {
    return true;
  }

  if (sub.status === 'past_due' && sub.gracePeriodEndsAt) {
    // Check if grace period is still valid
    return new Date() < sub.gracePeriodEndsAt;
  }

  return false;
}

export async function findSubscriptionByProviderReference(reference: string | null | undefined) {
  const normalizedReference = reference?.trim();
  if (!normalizedReference) {
    return null;
  }

  return db.query.subscriptions.findFirst({
    where: (subs, { eq: eqFn, or: orFn }) =>
      orFn(
        eqFn(subs.id, normalizedReference),
        eqFn(subs.providerSubscriptionId, normalizedReference)
      ),
  });
}

export function resolveProviderSubscriptionHandle(subscription: {
  id: string;
  providerSubscriptionId?: string | null;
}) {
  const providerSubscriptionId = subscription.providerSubscriptionId?.trim();
  return providerSubscriptionId && providerSubscriptionId.length > 0
    ? providerSubscriptionId
    : subscription.id;
}

export async function getActiveSubscription(userId: string, tenantId: string) {
  if (!tenantId) {
    throw new Error('tenantId is required for membership lookup');
  }
  const sub = await db.query.subscriptions.findFirst({
    where: and(eq(subscriptions.userId, userId), eq(subscriptions.tenantId, tenantId)),
  });

  if (!sub) return null;

  const isActive =
    sub.status === 'active' ||
    sub.status === 'trialing' ||
    (sub.status === 'past_due' && sub.gracePeriodEndsAt
      ? new Date() < sub.gracePeriodEndsAt
      : false);

  if (!isActive) return null;

  return sub;
}
