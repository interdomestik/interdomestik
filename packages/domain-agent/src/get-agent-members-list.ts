import {
  agentClients,
  and,
  asc,
  claims,
  desc,
  eq,
  ilike,
  or,
  sql,
  user,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { countDistinct } from 'drizzle-orm';
import { claimLifecycleStatusIn } from '@interdomestik/domain-claims/claims/lifecycle-read-sql';

const ACTIVE_STATUSES = [
  'draft',
  'submitted',
  'submitted_to_airline',
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
  authority: TenantAuthority;
  agentId: string;
  /** Verified effective access tenant of the agent session. */
  tenantId: string;
  /** Verified session role; only agents may read their member list. */
  role: string | null;
  query?: string;
  limit?: number;
  cursor?: string | null;
}): Promise<AgentMembersListResult> {
  const { agentId, tenantId, role, authority, limit = 50, query } = params;

  if (role !== 'agent') {
    throw new Error('Forbidden: agent members list requires the agent role');
  }

  const grantedTenant = memberTenant(authority, agentId);
  if (grantedTenant !== tenantId) throw new Error('Forbidden: agent tenant changed');

  const normalizedQuery = query?.trim();

  const searchFilter = normalizedQuery
    ? or(ilike(user.name, `%${normalizedQuery}%`), ilike(user.memberNumber, `%${normalizedQuery}%`))
    : undefined;

  const rows = await withTenantAuthority(
    authority,
    async tx =>
      await tx
        .select({
          memberId: agentClients.memberId,
          name: user.name,
          membershipNumber: user.memberNumber,
          userUpdatedAt: user.updatedAt,
          joinedAt: agentClients.joinedAt,
          activeClaimsCount: sql<number>`coalesce(sum(case when ${claims.id} is not null and ${claimLifecycleStatusIn([...ACTIVE_STATUSES])} then 1 else 0 end), 0)`,
          lastClaimUpdatedAt: sql<Date | null>`max(${claims.updatedAt})`,
        })
        .from(agentClients)
        .innerJoin(user, eq(agentClients.memberId, user.id))
        .leftJoin(
          claims,
          and(eq(claims.userId, user.id), eq(claims.tenantId, agentClients.tenantId))
        )
        .where(and(...memberScope(agentId, tenantId), ...(searchFilter ? [searchFilter] : [])))
        .groupBy(
          agentClients.memberId,
          user.name,
          user.memberNumber,
          user.updatedAt,
          agentClients.joinedAt
        )
        .orderBy(
          desc(
            sql`coalesce(max(${claims.updatedAt}), ${user.updatedAt}, ${agentClients.joinedAt})`
          ),
          asc(agentClients.memberId)
        )
        .limit(limit)
  );

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

function memberTenant(authority: TenantAuthority, agentId: string): string {
  const { tenantId, principal } = readTenantAuthority(authority);
  if (principal?.userId !== agentId || principal.role !== 'agent')
    throw new Error('Forbidden: agent member authority required');
  return tenantId;
}

function memberScope(agentId: string, tenantId: string) {
  return [
    eq(agentClients.agentId, agentId),
    eq(agentClients.tenantId, tenantId),
    eq(agentClients.status, 'active'),
    eq(user.role, 'member'),
  ];
}

export async function getAgentMemberCount(params: {
  authority: TenantAuthority;
  agentId: string;
}): Promise<number> {
  const { authority, agentId } = params;
  const tenantId = memberTenant(authority, agentId);
  const [row] = await withTenantAuthority(authority, tx =>
    tx
      .select({ count: countDistinct(agentClients.memberId) })
      .from(agentClients)
      .innerJoin(user, eq(agentClients.memberId, user.id))
      .where(and(...memberScope(agentId, tenantId)))
  );
  return Number(row?.count ?? 0);
}
