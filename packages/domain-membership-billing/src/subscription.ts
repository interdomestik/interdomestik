import { and, db, eq, subscriptions, withTenantContext } from '@interdomestik/database';

import {
  getMembershipLifecycleBucket,
  membershipLifecycleGrantsAccess,
} from './subscription/lifecycle-reporting';

/**
 * Checks if a user has an active membership that grants access to benefits.
 * Access-active lifecycle buckets:
 * - active
 * - trialing
 * - active_in_grace
 * - scheduled_cancel
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
  const sub = await withTenantContext({ tenantId, role: 'member' }, tx =>
    tx.query.subscriptions.findFirst({
      where: and(eq(subscriptions.userId, userId), eq(subscriptions.tenantId, tenantId)),
    })
  );

  if (!sub) return false;

  return membershipLifecycleGrantsAccess(getMembershipLifecycleBucket({ subscription: sub }));
}

export async function findSubscriptionByProviderReference(
  reference: string | null | undefined,
  options: { tenantId?: string | null } = {}
) {
  const normalizedReference = reference?.trim();
  if (!normalizedReference) {
    return null;
  }
  const tenantId = options.tenantId?.trim();

  if (tenantId) {
    // db-access-guard: tenant-scoped -- reason: tenantId constrains race-recovery provider reference lookup.
    return db.query.subscriptions.findFirst({
      where: (subs, { and: andFn, eq: eqFn, or: orFn }) =>
        andFn(
          eqFn(subs.tenantId, tenantId),
          orFn(
            eqFn(subs.id, normalizedReference),
            eqFn(subs.providerSubscriptionId, normalizedReference)
          )
        ),
    });
  }

  // db-access-guard: system-exempt -- reason: provider reference lookup resolves tenant from payment provider event
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
  const sub = await withTenantContext({ tenantId, role: 'member' }, tx =>
    tx.query.subscriptions.findFirst({
      where: and(eq(subscriptions.userId, userId), eq(subscriptions.tenantId, tenantId)),
    })
  );

  if (!sub) return null;

  const bucket = getMembershipLifecycleBucket({ subscription: sub });
  if (!membershipLifecycleGrantsAccess(bucket)) return null;

  return sub;
}
