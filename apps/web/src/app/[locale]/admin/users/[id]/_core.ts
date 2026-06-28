import { withTenantContext, type TenantTransaction } from '@interdomestik/database';
import { db } from '@interdomestik/database/db';
import {
  subscriptions,
  userNotificationPreferences,
  user as userTable,
} from '@interdomestik/database/schema';
import {
  getMembershipLifecycleBucket,
  type MembershipLifecycleBucket,
  type MembershipLifecycleInput,
} from '@interdomestik/domain-membership-billing';
import { and, eq } from 'drizzle-orm';

import { getAdminUserClaimSummary } from './_claim-summary';

export type AdminUserClaimCounts = {
  total: number;
  open: number;
  resolved: number;
  rejected: number;
};

export type AdminUserMembershipStatus = MembershipLifecycleBucket;

export function computeAdminUserClaimCounts(
  rows: Array<{ status: string | null; total: unknown }>
): AdminUserClaimCounts {
  const counts: AdminUserClaimCounts = { total: 0, open: 0, resolved: 0, rejected: 0 };

  for (const row of rows) {
    const status = row.status || 'draft';
    const total = Number(row.total || 0);

    counts.total += total;
    if (status === 'resolved') {
      counts.resolved += total;
    } else if (status === 'rejected') {
      counts.rejected += total;
    } else {
      counts.open += total;
    }
  }

  return counts;
}

export function getAdminUserMembershipStatus(
  subscription: MembershipLifecycleInput,
  now?: Date
): AdminUserMembershipStatus {
  return getMembershipLifecycleBucket({ subscription, now });
}

export type AdminUserProfileOk = {
  kind: 'ok';
  member: MemberWithAgent;
  subscription: SubscriptionRow | null;
  preferences: PreferencesRow | null;
  counts: AdminUserClaimCounts;
  recentClaims: Array<{
    id: string;
    title: string | null;
    status: string;
    claimAmount: string | null;
    currency: string | null;
    createdAt: Date | null;
  }>;
  membershipStatus: AdminUserMembershipStatus;
};

export type AdminUserProfileResult = { kind: 'not_found' } | AdminUserProfileOk;

type DbClient = typeof db | TenantTransaction;

async function getMemberWithAgent(dbClient: DbClient, userId: string, tenantId: string) {
  return dbClient.query.user.findFirst({
    where: and(eq(userTable.id, userId), eq(userTable.tenantId, tenantId)),
    with: {
      agent: true,
    },
  });
}

export async function getAdminUserProfileCore(args: {
  userId: string;
  tenantId: string | null;
  recentClaimsLimit: number;
}): Promise<AdminUserProfileResult> {
  if (!args.tenantId) return { kind: 'not_found' };

  return withTenantContext({ tenantId: args.tenantId, role: 'admin' }, async tx => {
    const member = await getMemberWithAgent(tx, args.userId, args.tenantId!);

    if (!member) return { kind: 'not_found' };

    const [subscription, preferences, claimSummary] = await Promise.all([
      tx.query.subscriptions.findFirst({
        where: and(eq(subscriptions.userId, member.id), eq(subscriptions.tenantId, args.tenantId!)),
        orderBy: (table, { desc: descFn }) => [descFn(table.createdAt)],
      }),
      tx.query.userNotificationPreferences.findFirst({
        where: and(
          eq(userNotificationPreferences.userId, member.id),
          eq(userNotificationPreferences.tenantId, args.tenantId!)
        ),
      }),
      getAdminUserClaimSummary({
        db: tx,
        recentClaimsLimit: args.recentClaimsLimit,
        tenantId: args.tenantId!,
        userId: member.id,
      }),
    ]);

    const membershipStatus = getAdminUserMembershipStatus(subscription);

    return {
      kind: 'ok',
      member,
      subscription: (subscription ?? null) as SubscriptionRow | null,
      preferences: (preferences ?? null) as PreferencesRow | null,
      counts: claimSummary.counts,
      recentClaims: claimSummary.recentClaims,
      membershipStatus,
    };
  });
}

type MemberWithAgent = NonNullable<Awaited<ReturnType<typeof getMemberWithAgent>>>;

type SubscriptionRow = NonNullable<Awaited<ReturnType<typeof db.query.subscriptions.findFirst>>>;

type PreferencesRow = NonNullable<
  Awaited<ReturnType<typeof db.query.userNotificationPreferences.findFirst>>
>;
