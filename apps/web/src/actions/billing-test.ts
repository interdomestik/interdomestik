'use server';

import { auth } from '@/lib/auth';
import { isBillingTestActivationEnabled } from '@/lib/runtime-environment';
import { db, subscriptions } from '@interdomestik/database';
import {
  createActiveAnnualMembershipFulfillment,
  resolveCanonicalMembershipPlanState,
} from '@interdomestik/domain-membership-billing/annual-membership';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

/**
 * DEVELOPMENT/E2E ONLY: Mock subscription activation.
 * Only works in automated/dev runtimes with explicit billing-test enablement.
 */
export async function mockActivateSubscription(planId: string, priceId: string) {
  if (!isBillingTestActivationEnabled()) {
    throw new Error('Unauthorized: Billing test mode not enabled');
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error('Unauthorized');
  }

  const tenantId = ensureTenantId(session);
  const now = new Date();
  const canonicalPlanState = await resolveCanonicalMembershipPlanState({
    tenantId,
    planId: priceId || planId,
  });
  const activeAnnualMembershipState = createActiveAnnualMembershipFulfillment(
    canonicalPlanState.planId,
    now,
    canonicalPlanState.planKey
  );

  // Create or update mock subscription
  await db
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
    });

  revalidatePath('/[locale]/(app)/member/membership', 'layout');
  return { success: true };
}
