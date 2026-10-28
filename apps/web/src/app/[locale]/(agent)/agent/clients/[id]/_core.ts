import { withTenantContext, type TenantTransaction } from '@interdomestik/database';
import {
  agentClients,
  memberActivities,
  subscriptions,
  userNotificationPreferences,
  user as userTable,
} from '@interdomestik/database/schema';
import { and, desc, eq } from 'drizzle-orm';

import { getAgentClientClaimSummary, type AgentClientClaimCounts } from './_claim-summary';
export type { AgentClientClaimCounts } from './_claim-summary';

const AGENT_CLIENT_PROFILE_ROLE = 'agent';

const membershipStatusStyles: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  past_due: 'bg-amber-100 text-amber-700 border-amber-200',
  paused: 'bg-slate-100 text-slate-700 border-slate-200',
  canceled: 'bg-rose-100 text-rose-700 border-rose-200',
  none: 'bg-muted text-muted-foreground border-transparent',
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
  { kind: 'not_found' } | { kind: 'forbidden' } | AgentClientProfileOk;

type AgentClientProfileReadParams = {
  memberId: string;
  agentId: string;
  tenantId: string;
};

/**
 * Agent client profile read model.
 * Validates the exercised session role and effective access tenant before any read, then performs
 * the whole read closure inside one tenant-context transaction. Admission is the active canonical
 * agent_clients relationship; no member or private child data is read before it is established.
 * Database failures propagate to the route error boundary.
 */
export async function getAgentClientProfileCore(args: {
  memberId: string;
  viewer: { id: string; role?: string | null; tenantId?: string | null };
}): Promise<AgentClientProfileResult> {
  const { memberId, viewer } = args;
  const role = viewer.role;

  if (role !== AGENT_CLIENT_PROFILE_ROLE) {
    return { kind: 'forbidden' };
  }

  const tenantId = viewer.tenantId?.trim();
  if (!tenantId) {
    return { kind: 'forbidden' };
  }

  return withTenantContext({ tenantId, role }, tx =>
    readAgentClientProfile(tx, { memberId, agentId: viewer.id, tenantId })
  );
}

async function readAgentClientProfile(
  tx: TenantTransaction,
  params: AgentClientProfileReadParams
): Promise<AgentClientProfileResult> {
  const { memberId, agentId, tenantId } = params;

  const assignments = await tx
    .select({ id: agentClients.id })
    .from(agentClients)
    .where(
      and(
        eq(agentClients.tenantId, tenantId),
        eq(agentClients.agentId, agentId),
        eq(agentClients.memberId, memberId),
        eq(agentClients.status, 'active')
      )
    )
    .limit(1);

  if (assignments.length === 0) {
    return { kind: 'forbidden' };
  }

  const member = await fetchMember(tx, memberId, tenantId);

  if (!member) {
    return { kind: 'not_found' };
  }

  const [subscription, preferences, claimSummary, activities] = await Promise.all([
    tx.query.subscriptions.findFirst({
      where: and(eq(subscriptions.userId, member.id), eq(subscriptions.tenantId, tenantId)),
      orderBy: (table, { desc: descFn }) => [descFn(table.createdAt)],
    }),
    tx.query.userNotificationPreferences.findFirst({
      where: and(
        eq(userNotificationPreferences.userId, member.id),
        eq(userNotificationPreferences.tenantId, tenantId)
      ),
    }),
    getAgentClientClaimSummary(tx, member.id, tenantId),
    tx.query.memberActivities.findMany({
      where: and(eq(memberActivities.memberId, member.id), eq(memberActivities.tenantId, tenantId)),
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
    claimCounts: claimSummary.claimCounts,
    recentClaims: claimSummary.recentClaims,
    activities: (activities ?? []) as MemberActivities,
  };
}

async function fetchMember(tx: TenantTransaction, memberId: string, tenantId: string) {
  return tx.query.user.findFirst({
    where: and(eq(userTable.id, memberId), eq(userTable.tenantId, tenantId)),
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

type TenantQuery = TenantTransaction['query'];

export type MemberRecord = NonNullable<Awaited<ReturnType<typeof fetchMember>>>;
export type SubscriptionRecord = Awaited<ReturnType<TenantQuery['subscriptions']['findFirst']>>;
export type PreferencesRecord = Awaited<
  ReturnType<TenantQuery['userNotificationPreferences']['findFirst']>
>;
export type MemberActivities = Awaited<ReturnType<TenantQuery['memberActivities']['findMany']>>;
