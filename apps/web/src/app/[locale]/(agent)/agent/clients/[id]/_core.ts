import { db } from '@interdomestik/database/db';
import {
  agentClients,
  claims,
  memberActivities,
  subscriptions,
  userNotificationPreferences,
  user as userTable,
} from '@interdomestik/database/schema';
import { and, count, desc, eq } from 'drizzle-orm';

const RECENT_CLAIMS_LIMIT = 6;

const membershipStatusStyles: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  past_due: 'bg-amber-100 text-amber-700 border-amber-200',
  paused: 'bg-slate-100 text-slate-700 border-slate-200',
  canceled: 'bg-rose-100 text-rose-700 border-rose-200',
  none: 'bg-muted text-muted-foreground border-transparent',
};

export type AgentClientClaimCounts = {
  total: number;
  open: number;
  resolved: number;
  rejected: number;
};

export type AgentClientMembership = {
  status: string;
  badgeClass: string;
  subscription: SubscriptionRecord | null;
};

export type AgentClientProfileOk = {
  kind: 'ok';
  member: MemberRecord;
  membership: AgentClientMembership;
  preferences: PreferencesRecord | null;
  claimCounts: AgentClientClaimCounts;
  recentClaims: Array<{ id: string; status: string | null }>;
  activities: MemberActivities;
};

export type AgentClientProfileResult =
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | AgentClientProfileOk;

export async function getAgentClientProfileCore(args: {
  memberId: string;
  viewer: { id: string; role?: string | null };
}): Promise<AgentClientProfileResult> {
  const { memberId, viewer } = args;

  const member = await fetchMember(memberId);

  if (!member) {
    return { kind: 'not_found' };
  }

  if (viewer.role === 'agent') {
    const assignments = await db
      .select()
      .from(agentClients)
      .where(
        and(
          eq(agentClients.agentId, viewer.id),
          eq(agentClients.memberId, member.id),
          eq(agentClients.status, 'active')
        )
      )
      .limit(1);

    if (assignments.length === 0) {
      return { kind: 'forbidden' };
    }
  }

  const [subscription, preferences, claimCounts, recentClaims, activities] = await Promise.all([
    db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, member.id),
      orderBy: (table, { desc: descFn }) => [descFn(table.createdAt)],
    }),
    db.query.userNotificationPreferences.findFirst({
      where: eq(userNotificationPreferences.userId, member.id),
    }),
    db
      .select({ status: claims.status, total: count() })
      .from(claims)
      .where(eq(claims.userId, member.id))
      .groupBy(claims.status),
    db
      .select({
        id: claims.id,
        status: claims.status,
      })
      .from(claims)
      .where(eq(claims.userId, member.id))
      .orderBy(desc(claims.createdAt))
      .limit(RECENT_CLAIMS_LIMIT),
    db.query.memberActivities.findMany({
      where: eq(memberActivities.memberId, member.id),
      orderBy: [desc(memberActivities.occurredAt)],
      with: {
        agent: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
  ]);

  const counts: AgentClientClaimCounts = { total: 0, open: 0, resolved: 0, rejected: 0 };
  for (const row of claimCounts) {
    const status = (row.status || 'draft') as string;
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

  const rawStatus = (subscription as { status?: string | null } | null | undefined)?.status;
  const membershipStatus = rawStatus && membershipStatusStyles[rawStatus] ? rawStatus : 'none';

  return {
    kind: 'ok',
    member,
    membership: {
      status: membershipStatus,
      badgeClass: membershipStatusStyles[membershipStatus],
      subscription: (subscription ?? null) as SubscriptionRecord | null,
    },
    preferences: (preferences ?? null) as PreferencesRecord | null,
    claimCounts: counts,
    recentClaims,
    activities: (activities ?? []) as MemberActivities,
  };
}

async function fetchMember(memberId: string) {
  return db.query.user.findFirst({
    where: eq(userTable.id, memberId),
    with: {
      agent: {
        columns: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });
}

export type MemberRecord = NonNullable<Awaited<ReturnType<typeof fetchMember>>>;
export type SubscriptionRecord = Awaited<ReturnType<typeof db.query.subscriptions.findFirst>>;
export type PreferencesRecord = Awaited<
  ReturnType<typeof db.query.userNotificationPreferences.findFirst>
>;
export type MemberActivities = Awaited<ReturnType<typeof db.query.memberActivities.findMany>>;
