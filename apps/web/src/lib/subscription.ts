import { db, eq, subscriptions } from '@interdomestik/database';

/**
 * Checks if a user has an active membership that grants access to benefits.
 * Allowed statuses:
 * - 'active'
 * - 'trialing'
 * - 'past_due' (ONLY if still within grace period)
 */
export async function hasActiveMembership(userId: string): Promise<boolean> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
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
