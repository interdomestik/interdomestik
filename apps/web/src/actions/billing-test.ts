'use server';

import { isBillingTestActivationEnabled } from '@/lib/runtime-environment';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { subscriptions } from '@interdomestik/database';
import {
  createActiveAnnualMembershipFulfillment,
  resolveCanonicalMembershipPlanState,
} from '@interdomestik/domain-membership-billing/annual-membership';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

/**
 * DEVELOPMENT/E2E ONLY: Mock subscription activation.
 * Only works in automated/dev runtimes with explicit billing-test enablement.
 */
export async function mockActivateSubscription(planId: string, priceId: string) {
  if (!isBillingTestActivationEnabled()) {
    throw new Error('Unauthorized: Billing test mode not enabled');
  }

  const authorized = await authorizeSessionTenant(await headers());

  if (!authorized) {
    throw new Error('Unauthorized');
  }

  const { session, authority } = authorized;
  const { tenantId } = readTenantAuthority(authority);
  const now = new Date();
  const canonicalPlanState = await resolveCanonicalMembershipPlanState({
    authority,
    planId: priceId || planId,
  });
  const activeAnnualMembershipState = createActiveAnnualMembershipFulfillment(
    canonicalPlanState.planId,
    now,
    canonicalPlanState.planKey
  );

  // Create or update mock subscription
  // db-access-guard: tenant-scoped -- reason: tenantId resolved into local variable before this DB call
  await withTenantAuthority(authority, async tx =>
    tx
      .insert(subscriptions)
      .values({
        id: `mock_sub_${Date.now()}`,
        userId: session.user.id,
        tenantId,
        ...activeAnnualMembershipState,
      })
      .onConflictDoUpdate({
        target: [subscriptions.userId],
        set: {
          ...activeAnnualMembershipState,
        },
      })
  );

  revalidatePath('/[locale]/(app)/member/membership', 'layout');
  return { success: true };
}
