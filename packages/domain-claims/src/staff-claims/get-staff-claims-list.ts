import { claims, db, desc, eq, inArray, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

export type StaffClaimsListItem = {
  id: string;
  claimNumber: string | null;
  status: string | null;
  stageLabel: string;
  updatedAt: string | null;
  agentName?: string;
  memberName?: string;
};

function formatStageLabel(status: string | null | undefined) {
  if (!status) return 'Draft';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getStaffClaimsList(params: {
  staffId: string;
  tenantId: string;
  limit: number;
  cursor?: string | null;
}): Promise<StaffClaimsListItem[]> {
  const { tenantId, limit } = params;

  const rows = await db
    .select({
      id: claims.id,
      claimNumber: claims.claimNumber,
      status: claims.status,
      updatedAt: claims.updatedAt,
      agentId: claims.agentId,
      memberName: user.name,
    })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id))
    .where(withTenant(tenantId, claims.tenantId))
    .orderBy(desc(claims.updatedAt))
    .limit(limit);

  const agentIds = Array.from(
    new Set(rows.map(row => row.agentId).filter((id): id is string => !!id))
  );

  const agentNames = new Map<string, string>();
  if (agentIds.length > 0) {
    const agents = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(withTenant(tenantId, user.tenantId, inArray(user.id, agentIds)));

    for (const agent of agents) {
      if (agent.id && agent.name) {
        agentNames.set(agent.id, agent.name);
      }
    }
  }

  return rows.map(row => ({
    id: row.id,
    claimNumber: row.claimNumber,
    status: row.status,
    stageLabel: formatStageLabel(row.status),
    updatedAt: normalizeDate(row.updatedAt),
    agentName: row.agentId ? agentNames.get(row.agentId) : undefined,
    memberName: row.memberName ?? undefined,
  }));
}
