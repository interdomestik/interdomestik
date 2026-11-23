'use server';

import { isBillingTestActivationEnabled } from '@/lib/runtime-environment';
import { resolveMemberAcceptanceForRequest } from '@/lib/privacy/require-member-acceptance';
import { subscriptions } from '@interdomestik/database';
import {
  createActiveAnnualMembershipFulfillment,
  resolveCanonicalMembershipPlanState,
} from '@interdomestik/domain-membership-billing/annual-membership';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { UnauthorizedError } from '@interdomestik/shared-auth/errors';

/**
 * DEVELOPMENT/E2E ONLY: Mock subscription activation.
 * Only works in automated/dev runtimes with explicit billing-test enablement.
 */
export async function mockActivateSubscription(planId: string, priceId: string) {
  if (!isBillingTestActivationEnabled()) {
    throw new UnauthorizedError('Unauthorized: Billing test mode not enabled');
  }

  const admission = await resolveMemberAcceptanceForRequest(await headers());

  if (!admission.ok) {
    throw new UnauthorizedError(admission.failure.code);
  }

  const { session, authority } = admission.authorized;
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
  await withTenantAuthority(
    authority,
    async tx =>
      await tx
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
