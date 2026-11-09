import {
  agentClients,
  eq,
  ilike,
  inArray,
  or,
  user,
  type subscriptions,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { resolveEffectiveMembership } from '@interdomestik/domain-membership-billing/sponsor-coverage';
import { and, type SQL } from 'drizzle-orm';

import { ensureTenantId } from '@interdomestik/shared-auth';
import type { UserSession } from '../types';

type Filters = {
  search?: string;
  limit?: number;
  offset?: number;
};

type Subscription = typeof subscriptions.$inferSelect;
export type AgentUser = typeof user.$inferSelect & {
  agent: typeof user.$inferSelect | null;
  subscriptions: Subscription[];
  subscription: Subscription | null;
  membershipSource: 'sponsor' | 'subscription' | 'none';
  unreadCount: number;
  alertLink: null;
};

export async function getAgentUsersCore(params: {
  authority: TenantAuthority;
  session: UserSession | null;
  filters?: Filters;
}): Promise<AgentUser[]> {
  const { authority, session, filters } = params;

  if (!session || (session.user.role !== 'agent' && session.user.role !== 'admin')) {
    throw new Error('Unauthorized');
  }

  const { tenantId, principal } = readTenantAuthority(authority);
  const role = session.user.role;
  if (
    tenantId !== ensureTenantId(session) ||
    principal?.userId !== session.user.id ||
    principal.role !== role
  ) {
    throw new Error('Unauthorized');
  }

  // Every read runs in one tenant transaction carrying the actual verified session role.
  return withTenantAuthority(authority, async tx => {
    const conditions: SQL[] = [inArray(user.role, ['user', 'member'])];

    if (role === 'agent') {
      const links = await tx
        .select({ memberId: agentClients.memberId })
        .from(agentClients)
        .where(
          withTenant(
            tenantId,
            agentClients.tenantId,
            and(eq(agentClients.agentId, session.user.id), eq(agentClients.status, 'active'))
          )
        );

      const memberIds = links.map(link => link.memberId);

      if (memberIds.length === 0) {
        return [];
      }

      conditions.push(inArray(user.id, memberIds));
    }

    if (filters?.search) {
      const term = `%${filters.search}%`;
      const search = or(ilike(user.name, term), ilike(user.email, term));
      if (search) conditions.push(search);
    }

    const userConditions = conditions.length ? and(...conditions) : undefined;
    const users = await tx.query.user.findMany({
      where: withTenant(tenantId, user.tenantId, userConditions),
      orderBy: (users, { desc }) => [desc(users.createdAt)],
      limit: filters?.limit,
      offset: filters?.offset,
      with: {
        agent: true,
        subscriptions: {
          where: (subs, { eq: eqFn }) => eqFn(subs.tenantId, tenantId),
          orderBy: (subs, { desc: descFn }) => [descFn(subs.createdAt)],
          limit: 1,
        },
      },
    });

    const memberships = await resolveEffectiveMembership(
      tx,
      tenantId,
      users.map(row => row.id),
      new Date()
    );
    return users.map(userRow => {
      const membership = memberships.get(userRow.id);
      const row = userRow.subscriptions[0];
      let subscription: Subscription | null = null;
      if (membership?.source === 'subscription') {
        subscription = membership.subscription;
      } else if (membership?.source === 'sponsor' && row) {
        subscription = {
          ...row,
          ...membership.lifecycle,
          planId: membership.planId,
          planKey: membership.planKey,
          currentPeriodStart: membership.windowStart,
          currentPeriodEnd: membership.windowEnd,
        };
      }
      return {
        ...userRow,
        subscriptions: subscription ? [subscription] : [],
        unreadCount: 0,
        alertLink: null,
        membershipSource: membership?.source ?? 'none',
        subscription,
      };
    });
  });
}
