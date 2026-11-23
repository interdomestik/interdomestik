'use server';

import { isBillingTestActivationEnabled } from '@/lib/runtime-environment';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { subscriptions } from '@interdomestik/database';
import { assertNewSalesOpen, SalesClosedError } from '@interdomestik/database/pilot-switch';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import {
  createActiveAnnualMembershipFulfillment,
  resolveCanonicalMembershipPlanState,
} from '@interdomestik/domain-membership-billing/annual-membership';
import { UnauthorizedError } from '@interdomestik/shared-auth/errors';
import * as Sentry from '@sentry/nextjs';
import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

/**
 * DEVELOPMENT/E2E ONLY: Mock subscription activation.
 * Only works in automated/dev runtimes with explicit billing-test enablement.
 */
export async function mockActivateSubscription(planId: string, priceId: string) {
  if (!isBillingTestActivationEnabled()) {
    throw new UnauthorizedError('Unauthorized: Billing test mode not enabled');
  }

  const authorized = await authorizeSessionTenant(await headers());

  if (!authorized) {
    throw new UnauthorizedError('Unauthorized');
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

  try {
    await withTenantAuthority(authority, async tx => {
      try {
        await assertNewSalesOpen(tx, tenantId);
      } catch (error) {
        if (error instanceof SalesClosedError) {
          throw error;
        }
        Sentry.captureException(error, { tags: { operation: 'pilot.billingTestAdmission' } });
        throw new SalesClosedError();
      }
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
        });
    });
  } catch (error) {
    if (!(error instanceof SalesClosedError)) {
      throw error;
    }
    const t = await getTranslations('pricing');
    return { success: false, code: 'CLOSED', error: t('CLOSED') } as const;
  }

  revalidatePath('/[locale]/(app)/member/membership', 'layout');
  return { success: true } as const;
}
