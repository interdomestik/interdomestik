import { withTenantContext } from '@interdomestik/database';
import { subscriptions, user } from '@interdomestik/database/schema';
import { listTenantIdsForScheduledWork } from '@interdomestik/database';
import { and, eq, gte, lte } from 'drizzle-orm';

export type ScheduledSubscriptionMember = {
  userId: string | null;
  subId: string;
  tenantId: string | null;
  name: string | null;
  email: string | null;
};

/**
 * Active subscription members for a scheduled job, selected per tenant under RLS. The run-wide
 * `limit` is a shared budget across tenants (visited in tenant id order), so one run never
 * selects more members than the former single cross-tenant query did.
 */
export async function selectActiveSubscriptionMembers(args: {
  limit: number;
  createdBetween?: { start: Date; end: Date };
}): Promise<ScheduledSubscriptionMember[]> {
  const members: ScheduledSubscriptionMember[] = [];

  for (const tenantId of await listTenantIdsForScheduledWork()) {
    const remaining = args.limit - members.length;
    if (remaining <= 0) break;

    const predicates = [eq(subscriptions.tenantId, tenantId), eq(subscriptions.status, 'active')];
    if (args.createdBetween) {
      predicates.push(
        gte(subscriptions.createdAt, args.createdBetween.start),
        lte(subscriptions.createdAt, args.createdBetween.end)
      );
    }

    const rows = await withTenantContext({ tenantId, role: 'system' }, tx =>
      tx
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
        .limit(remaining)
    );
    members.push(...rows);
  }

  return members;
}
