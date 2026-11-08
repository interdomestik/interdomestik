import type { db } from '@interdomestik/database/db';
import {
  agentClients,
  memberActivities,
  userNotificationPreferences,
  user as userTable,
} from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { resolveEffectiveMembership } from '@interdomestik/domain-membership-billing/sponsor-coverage';
import { getAgentMemberDetail } from '@interdomestik/domain-agent';
import { and, desc, eq } from 'drizzle-orm';

import { getAgentClientClaimSummary, type AgentClientClaimCounts } from './_claim-summary';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
export type { AgentClientClaimCounts } from './_claim-summary';

const membershipStatusStyles: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  past_due: 'bg-amber-100 text-amber-700 border-amber-200',
  paused: 'bg-slate-100 text-slate-700 border-slate-200',
  canceled: 'bg-rose-100 text-rose-700 border-rose-200',
  none: 'bg-muted text-muted-foreground border-transparent',
};

export type AgentClientMembership = {
  source: 'sponsor' | 'subscription' | 'none';
  planId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
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

export async function getAgentClientProfileCore(args: {
  memberId: string;
  viewer: { id: string; role?: string | null };
  /** The viewer session's tenant authority; null when the viewer carries no tenant. */
  authority: TenantAuthority | null;
}): Promise<AgentClientProfileResult> {
  const { memberId, viewer, authority } = args;

  if (!authority) {
    return { kind: 'forbidden' };
  }

  const { tenantId } = readTenantAuthority(authority);
  const member = await fetchMember(memberId, authority);

  if (!member) {
    return { kind: 'not_found' };
  }

  if (viewer.role === 'agent') {
    const assignments = await withTenantAuthority(authority, tx =>
      tx
        .select()
        .from(agentClients)
        .where(
          and(
            eq(agentClients.tenantId, tenantId),
            eq(agentClients.agentId, viewer.id),
            eq(agentClients.memberId, member.id),
            eq(agentClients.status, 'active')
          )
        )
        .limit(1)
    );

    if (assignments.length === 0) {
      // Auth widening (Phase C pilot):
      // Allow if the member is assigned to the agent via domain-agent assignment rules.
      // Do not re-implement assignment logic in web.
      let assignment: unknown = null;
      try {
        assignment = await getAgentMemberDetail({
          agentId: viewer.id,
          authority,
          memberId: member.id,
        });
      } catch {
        // Defensive: domain-agent should return null for non-assigned, but never let a throw
        // turn into a 500 from the shared loader.
        assignment = null;
      }

      if (!assignment) {
        return { kind: 'forbidden' };
      }
    }
  }

  const [memberships, preferences, claimSummary, activities] = await Promise.all([
    withTenantAuthority(authority, tx =>
      resolveEffectiveMembership(tx, tenantId, [member.id], new Date())
    ),
    withTenantAuthority(authority, tx =>
      tx.query.userNotificationPreferences.findFirst({
        where: and(
          eq(userNotificationPreferences.userId, member.id),
          eq(userNotificationPreferences.tenantId, tenantId)
        ),
      })
    ),
    getAgentClientClaimSummary(member.id, authority),
    withTenantAuthority(authority, tx =>
      tx.query.memberActivities.findMany({
        where: and(
          eq(memberActivities.memberId, member.id),
          eq(memberActivities.tenantId, tenantId)
        ),
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
      })
    ),
  ]);

  const effective = memberships.get(member.id) ?? { source: 'none' as const };
  const subscription = effective.source === 'subscription' ? effective.subscription : null;
  const rawStatus =
    effective.source === 'sponsor' ? effective.lifecycle.status : subscription?.status;
  const membershipStatus = rawStatus && membershipStatusStyles[rawStatus] ? rawStatus : 'none';

  return {
    kind: 'ok',
    member,
    membership: {
      source: effective.source,
      planId: effective.source === 'sponsor' ? effective.planId : (subscription?.planId ?? null),
      currentPeriodStart:
        effective.source === 'sponsor'
          ? effective.windowStart
          : (subscription?.currentPeriodStart ?? null),
      currentPeriodEnd:
        effective.source === 'sponsor'
          ? effective.windowEnd
          : (subscription?.currentPeriodEnd ?? null),
      cancelAtPeriodEnd:
        effective.source === 'sponsor'
          ? effective.lifecycle.cancelAtPeriodEnd
          : (subscription?.cancelAtPeriodEnd ?? false),
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

async function fetchMember(memberId: string, authority: TenantAuthority) {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, tx =>
    tx.query.user.findFirst({
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
    })
  );
}

export type MemberRecord = NonNullable<Awaited<ReturnType<typeof fetchMember>>>;
export type SubscriptionRecord = Awaited<ReturnType<typeof db.query.subscriptions.findFirst>>;
export type PreferencesRecord = Awaited<
  ReturnType<typeof db.query.userNotificationPreferences.findFirst>
>;
export type MemberActivities = Awaited<ReturnType<typeof db.query.memberActivities.findMany>>;
