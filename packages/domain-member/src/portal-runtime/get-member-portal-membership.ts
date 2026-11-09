import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import {
  getMembershipLifecycleBucket,
  membershipLifecycleGrantsAccess,
  type MembershipLifecycleBucket,
} from '@interdomestik/domain-membership-billing';
import { resolveEffectiveMembership } from '@interdomestik/domain-membership-billing/sponsor-coverage';

export type { MembershipLifecycleBucket } from '@interdomestik/domain-membership-billing';

export type MemberPortalMembership = {
  bucket: MembershipLifecycleBucket;
  currentPeriodEnd: Date | null;
  grantsNewCaseAccess: boolean;
};

export async function getMemberPortalMembership(params: {
  authority: TenantAuthority;
  memberId: string;
  now?: Date;
}): Promise<MemberPortalMembership> {
  const { authority, memberId } = params;
  const { tenantId } = readTenantAuthority(authority);

  return withTenantAuthority(authority, async tx => {
    const now = params.now ?? new Date();
    const memberships = await resolveEffectiveMembership(tx, tenantId, [memberId], now);
    const membership = memberships.get(memberId);
    const subscription = membership?.source === 'subscription' ? membership.subscription : null;
    const sponsor = membership?.source === 'sponsor' ? membership : null;
    const bucket = getMembershipLifecycleBucket({
      subscription: sponsor?.lifecycle ?? subscription,
      now,
    });

    return {
      bucket,
      currentPeriodEnd: sponsor?.windowEnd ?? subscription?.currentPeriodEnd ?? null,
      grantsNewCaseAccess: membershipLifecycleGrantsAccess(bucket),
    };
  });
}
