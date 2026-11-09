import {
  and,
  authorizePaddleTenant,
  eq,
  resolvePaddleSubscriptionOwner,
  subscriptions,
} from '@interdomestik/database';
import type { IngressCapability } from '@interdomestik/database/ingress';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';

import { PaddleSubscriptionReferenceAmbiguousError } from './paddle-webhooks/errors';
import { resolveEffectiveMembership } from './sponsor-coverage/resolve';

import {
  getMembershipLifecycleBucket,
  membershipLifecycleGrantsAccess,
} from './subscription/lifecycle-reporting';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

/**
 * Checks if a user has an active membership that grants access to benefits.
 * Access-active lifecycle buckets:
 * - active
 * - trialing
 * - active_in_grace
 * - scheduled_cancel
 *
 * @param userId - The user ID to check
 * @param authority - Tenant authority of the caller; the lookup is scoped to its tenant
 */
export async function hasActiveMembership(
  userId: string,
  authority: TenantAuthority
): Promise<boolean> {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, async tx => {
    const now = new Date();
    const memberships = await resolveEffectiveMembership(tx, tenantId, [userId], now);
    const membership = memberships.get(userId);
    let subscription = null;
    if (membership?.source === 'sponsor') subscription = membership.lifecycle;
    else if (membership?.source === 'subscription') subscription = membership.subscription;
    return membershipLifecycleGrantsAccess(getMembershipLifecycleBucket({ subscription, now }));
  });
}

export type PaddleSubscriptionLookup = {
  subscription: typeof subscriptions.$inferSelect;
  /** The `paddle-webhook` authority minted from the resolver-produced owner of this subscription. */
  authority: TenantAuthority;
};

/**
 * Webhook lookup of a subscription by an exact provider reference. The resolver names the owning
 * tenant/id (ambiguity is a terminal conflict, never "not found"); the owner is authorized with the
 * verified delivery and the subscription is read inside that tenant. The returned authority is the
 * one the row was read under, so callers reuse it for every later effect on the same tenant.
 */
export async function findPaddleSubscriptionByReference(
  reference: string | null | undefined,
  delivery: IngressCapability<'paddle-delivery'>
): Promise<PaddleSubscriptionLookup | null> {
  const normalizedReference = reference?.trim();
  if (!normalizedReference) {
    return null;
  }

  const owner = await resolvePaddleSubscriptionOwner(normalizedReference);
  if (owner === 'ambiguous') {
    throw new PaddleSubscriptionReferenceAmbiguousError(normalizedReference);
  }
  if (!owner) {
    return null;
  }

  const authority = authorizePaddleTenant(delivery, owner);
  const { tenantId } = readTenantAuthority(authority);
  const subscription = await withTenantAuthority(authority, tx =>
    tx.query.subscriptions.findFirst({
      where: (subs, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(subs.tenantId, tenantId), eqFn(subs.id, owner.subscriptionId)),
    })
  );
  if (!subscription) {
    return null;
  }
  if (subscription.tenantId !== tenantId) {
    throw new Error(
      `Paddle subscription ${subscription.id} tenant conflict: record=${subscription.tenantId} authority=${tenantId}`
    );
  }
  return { subscription, authority };
}

/**
 * Race-recovery lookup of a subscription by provider reference inside a tenant the caller already
 * holds an authority for. The tenant is the authority's; it never comes from the reference.
 */
export async function findPaddleSubscriptionInTenant(
  reference: string | null | undefined,
  authority: TenantAuthority
) {
  const normalizedReference = reference?.trim();
  if (!normalizedReference) {
    return null;
  }
  const { tenantId } = readTenantAuthority(authority);

  return withTenantAuthority(authority, tx =>
    tx.query.subscriptions.findFirst({
      where: (subs, { and: andFn, eq: eqFn, or: orFn }) =>
        andFn(
          eqFn(subs.tenantId, tenantId),
          orFn(
            eqFn(subs.id, normalizedReference),
            eqFn(subs.providerSubscriptionId, normalizedReference)
          )
        ),
    })
  );
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

export async function getActiveSubscription(
  userId: string,
  authority: TenantAuthority
): Promise<typeof subscriptions.$inferSelect | null> {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, async tx => {
    const now = new Date();
    const memberships = await resolveEffectiveMembership(tx, tenantId, [userId], now);
    const membership = memberships.get(userId);
    if (!membership || membership.source === 'none') return null;
    if (membership.source === 'subscription') {
      const sub = membership.subscription;
      return membershipLifecycleGrantsAccess(
        getMembershipLifecycleBucket({ subscription: sub, now })
      )
        ? sub
        : null;
    }
    const sub = await tx.query.subscriptions.findFirst({
      where: and(eq(subscriptions.userId, userId), eq(subscriptions.tenantId, tenantId)),
    });
    if (!sub) return null;
    return {
      ...sub,
      ...membership.lifecycle,
      planId: membership.planId,
      planKey: membership.planKey,
      currentPeriodStart: membership.windowStart,
      currentPeriodEnd: membership.windowEnd,
    };
  });
}
