import { db } from '@interdomestik/database/db';
import {
  claims,
  subscriptions,
  userNotificationPreferences,
  user as userTable,
} from '@interdomestik/database/schema';
import { and, count, desc, eq } from 'drizzle-orm';

export type AdminUserClaimCounts = {
  total: number;
  open: number;
  resolved: number;
  rejected: number;
};

export type AdminUserMembershipStatus = 'active' | 'past_due' | 'paused' | 'canceled' | 'none';

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
  rawStatus: string | null | undefined
): AdminUserMembershipStatus {
  if (rawStatus === 'active') return 'active';
  if (rawStatus === 'past_due') return 'past_due';
  if (rawStatus === 'paused') return 'paused';
  if (rawStatus === 'canceled') return 'canceled';
  return 'none';
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

async function getMemberWithAgent(userId: string, tenantId: string) {
  return db.query.user.findFirst({
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

  const member = await getMemberWithAgent(args.userId, args.tenantId);

  if (!member) return { kind: 'not_found' };

  const [subscription, preferences, claimCounts, recentClaims] = await Promise.all([
    db.query.subscriptions.findFirst({
      where: and(eq(subscriptions.userId, member.id), eq(subscriptions.tenantId, args.tenantId)),
      orderBy: (table, { desc: descFn }) => [descFn(table.createdAt)],
    }),
    db.query.userNotificationPreferences.findFirst({
      where: and(
        eq(userNotificationPreferences.userId, member.id),
        eq(userNotificationPreferences.tenantId, args.tenantId)
      ),
    }),
    db
      .select({ status: claims.status, total: count() })
      .from(claims)
      .where(and(eq(claims.userId, member.id), eq(claims.tenantId, args.tenantId)))
      .groupBy(claims.status),
    db
      .select({
        id: claims.id,
        title: claims.title,
        status: claims.status,
        claimAmount: claims.claimAmount,
        currency: claims.currency,
        createdAt: claims.createdAt,
      })
      .from(claims)
      .where(and(eq(claims.userId, member.id), eq(claims.tenantId, args.tenantId)))
      .orderBy(desc(claims.createdAt))
      .limit(args.recentClaimsLimit),
  ]);

  const counts = computeAdminUserClaimCounts(claimCounts);
  const membershipStatus = getAdminUserMembershipStatus(subscription?.status);

  return {
    kind: 'ok',
    member,
    subscription: (subscription ?? null) as SubscriptionRow | null,
    preferences: (preferences ?? null) as PreferencesRow | null,
    counts,
    recentClaims: recentClaims.map(c => ({ ...c, status: c.status ?? 'unknown' })),
    membershipStatus,
  };
}

type MemberWithAgent = NonNullable<Awaited<ReturnType<typeof getMemberWithAgent>>>;

type SubscriptionRow = NonNullable<Awaited<ReturnType<typeof db.query.subscriptions.findFirst>>>;

type PreferencesRow = NonNullable<
  Awaited<ReturnType<typeof db.query.userNotificationPreferences.findFirst>>
>;
