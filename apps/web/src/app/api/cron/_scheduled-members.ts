import { listScheduledTenantWork } from '@interdomestik/database';
import type { IngressCapability } from '@interdomestik/database/ingress';
import { subscriptions, user } from '@interdomestik/database/schema';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { effectiveCoverageMembers } from '@interdomestik/domain-membership-billing/sponsor-coverage';
import {
  getMembershipLifecycleBucket,
  membershipLifecycleGrantsAccess,
} from '@interdomestik/domain-membership-billing';
import { forEachInOrder } from '@/lib/in-order';

export type ScheduledSubscriptionMember = {
  userId: string | null;
  subId: string;
  tenantId: string | null;
  name: string | null;
  email: string | null;
};

/**
 * Effectively covered subscription members for a scheduled job, selected per tenant under RLS. The run-wide
 * `limit` is a shared budget across tenants (visited in tenant id order), so one run never
 * selects more members than the former single cross-tenant query did.
 */
export async function selectActiveSubscriptionMembers(args: {
  ingress: IngressCapability<'cron'>;
  limit: number;
  now?: Date;
  createdBetween?: { start: Date; end: Date };
}): Promise<ScheduledSubscriptionMember[]> {
  const members: ScheduledSubscriptionMember[] = [];
  const now = args.now ?? new Date();

  await forEachInOrder(
    await listScheduledTenantWork(args.ingress),
    async ({ tenantId, authority }) => {
      const remaining = args.limit - members.length;
      // Once the limit is reached the remaining tenants are not queried.
      if (remaining <= 0) return;

      const rows = await withTenantAuthority(authority, async tx => {
        const covered = await effectiveCoverageMembers(tx, tenantId, now);
        const userIds = covered
          .filter(
            ({ membership }) =>
              membership.source === 'sponsor' ||
              membershipLifecycleGrantsAccess(
                getMembershipLifecycleBucket({ subscription: membership.subscription, now })
              )
          )
          .map(member => member.userId);
        if (userIds.length === 0) return [];
        const predicates = [
          eq(subscriptions.tenantId, tenantId),
          inArray(subscriptions.userId, userIds),
        ];
        if (args.createdBetween) {
          predicates.push(
            gte(subscriptions.createdAt, args.createdBetween.start),
            lte(subscriptions.createdAt, args.createdBetween.end)
          );
        }

        return tx
          .select({
            userId: subscriptions.userId,
            subId: subscriptions.id,
            tenantId: subscriptions.tenantId,
            name: user.name,
            email: user.email,
          })
          .from(subscriptions)
          .innerJoin(user, and(eq(subscriptions.userId, user.id), eq(user.tenantId, tenantId)))
          .where(and(...predicates))
          .limit(remaining);
      });
      members.push(...rows);
    }
  );

  return members;
}
