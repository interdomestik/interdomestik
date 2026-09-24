import { subscriptions, withTenantContext } from '@interdomestik/database';
import {
  getMembershipLifecycleBucket,
  membershipLifecycleGrantsAccess,
  type MembershipLifecycleBucket,
} from '@interdomestik/domain-membership-billing';
import { and, eq } from 'drizzle-orm';

export type { MembershipLifecycleBucket } from '@interdomestik/domain-membership-billing';

export type MemberPortalMembership = {
  bucket: MembershipLifecycleBucket;
  currentPeriodEnd: Date | null;
  grantsNewCaseAccess: boolean;
};

export async function getMemberPortalMembership(params: {
  memberId: string;
  tenantId: string;
  now?: Date;
}): Promise<MemberPortalMembership> {
  const { memberId, tenantId } = params;
  if (!tenantId) throw new Error('Missing tenant context');

  return withTenantContext({ tenantId, role: 'member' }, async tx => {
    // db-access-guard: tenant-scoped -- reason: one read-only membership projection for one member
    const subscription = await tx.query.subscriptions.findFirst({
      columns: {
        cancelAtPeriodEnd: true,
        currentPeriodEnd: true,
        gracePeriodEndsAt: true,
        status: true,
      },
      where: and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.userId, memberId)),
    });

    const bucket = getMembershipLifecycleBucket({ subscription, now: params.now });

    return {
      bucket,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      grantsNewCaseAccess: membershipLifecycleGrantsAccess(bucket),
    };
  });
}
