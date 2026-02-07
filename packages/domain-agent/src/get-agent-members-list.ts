import {
  agentClients,
  and,
  asc,
  claims,
  db,
  desc,
  eq,
  ilike,
  or,
  sql,
  user,
} from '@interdomestik/database';

const ACTIVE_STATUSES = [
  'draft',
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
] as const;

export type AgentMemberListItem = {
  memberId: string;
  name: string;
  membershipNumber: string | null;
  openClaimsCount: number;
  activeClaimsCount: number;
  attentionState: 'needs_attention' | 'up_to_date';
  lastUpdatedAt: string | null;
};

export type AgentMembersListResult = {
  members: AgentMemberListItem[];
  total?: number;
  nextCursor?: string | null;
};

export async function getAgentMembersList(params: {
  agentId: string;
  tenantId: string;
  query?: string;
  limit?: number;
  cursor?: string | null;
}): Promise<AgentMembersListResult> {
  const { agentId, tenantId, limit = 50, query } = params;
  const normalizedQuery = query?.trim();

  const searchFilter = normalizedQuery
    ? or(ilike(user.name, `%${normalizedQuery}%`), ilike(user.memberNumber, `%${normalizedQuery}%`))
    : undefined;

  const rows = await db
    .select({
      memberId: agentClients.memberId,
      name: user.name,
      membershipNumber: user.memberNumber,
      userUpdatedAt: user.updatedAt,
      joinedAt: agentClients.joinedAt,
      activeClaimsCount: sql<number>`coalesce(sum(case when ${claims.status} in (${sql.join(
        ACTIVE_STATUSES.map(status => sql`${status}`),
        sql`, `
      )}) then 1 else 0 end), 0)`,
      lastClaimUpdatedAt: sql<Date | null>`max(${claims.updatedAt})`,
    })
    .from(agentClients)
    .innerJoin(user, eq(agentClients.memberId, user.id))
    .leftJoin(claims, and(eq(claims.userId, user.id), eq(claims.tenantId, agentClients.tenantId)))
    .where(
      and(
        eq(agentClients.agentId, agentId),
        eq(agentClients.tenantId, tenantId),
        eq(user.role, 'member'),
        ...(searchFilter ? [searchFilter] : [])
      )
    )
    .groupBy(
      agentClients.memberId,
      user.name,
      user.memberNumber,
      user.updatedAt,
      agentClients.joinedAt
    )
    .orderBy(
      desc(sql`coalesce(max(${claims.updatedAt}), ${user.updatedAt}, ${agentClients.joinedAt})`),
      asc(agentClients.memberId)
    )
    .limit(limit);

  const members = rows.map(row => {
    const lastUpdated = row.lastClaimUpdatedAt ?? row.userUpdatedAt ?? row.joinedAt ?? null;
    const openClaimsCount = Number(row.activeClaimsCount ?? 0);
    const attentionState: AgentMemberListItem['attentionState'] =
      openClaimsCount > 0 ? 'needs_attention' : 'up_to_date';

    return {
      memberId: row.memberId,
      name: row.name,
      membershipNumber: row.membershipNumber ?? null,
      openClaimsCount,
      activeClaimsCount: openClaimsCount,
      attentionState,
      lastUpdatedAt: lastUpdated ? new Date(lastUpdated).toISOString() : null,
    };
  });

  return { members };
}
