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
