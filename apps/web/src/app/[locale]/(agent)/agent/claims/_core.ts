import { withTenantContext, type TenantTransaction } from '@interdomestik/database';
import { agentClients, claims, user } from '@interdomestik/database/schema';
import { claimLifecycleStatusNotIn } from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import { ROLES } from '@interdomestik/shared-auth';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { mapAgentMemberClaimGroups } from './_claim-groups';

export interface AgentMemberClaimsDTO {
  memberId: string;
  memberName: string;
  memberEmail: string;
  claims: {
    id: string;
    title: string;
    status: string;
    statusLabelKey: string;
    createdAt: string;
    updatedAt: string | null;
  }[];
}

export function buildAgentClaimsWhere(params: {
  tenantId: string;
  memberIds: string[];
  branchId?: string | null;
}) {
  const base = and(eq(claims.tenantId, params.tenantId), inArray(claims.userId, params.memberIds));
  if (!params.branchId) {
    return base;
  }

  return and(base, eq(claims.branchId, params.branchId));
}

export type AgentClaimsResult =
  | { ok: true; data: AgentMemberClaimsDTO[] }
  | { ok: false; code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INTERNAL' };

export function buildAgentWorkspaceClaimHref(claimId: string): string {
  return `/agent/workspace/claims?claimId=${encodeURIComponent(claimId)}`;
}

const AGENT_CLAIMS_READER_ROLES = [
  ROLES.agent,
  ROLES.admin,
  ROLES.tenant_admin,
  ROLES.super_admin,
] as readonly string[];

async function readAgentMemberClaimGroups(
  tx: TenantTransaction,
  params: { tenantId: string; userId: string; branchId?: string | null }
): Promise<AgentMemberClaimsDTO[]> {
  const { tenantId, userId, branchId } = params;

  // Resolve members only through active canonical ownership.
  const activeAgentClientRows = await tx
    .select({ memberId: agentClients.memberId })
    .from(agentClients)
    .where(
      and(
        eq(agentClients.tenantId, tenantId),
        eq(agentClients.agentId, userId),
        eq(agentClients.status, 'active')
      )
    );

  const memberIds: string[] = Array.from(
    new Set<string>(
      activeAgentClientRows
        .map((row: { memberId: unknown }) => row.memberId)
        .filter((memberId: unknown): memberId is string => typeof memberId === 'string')
    )
  );

  if (memberIds.length === 0) {
    return [];
  }

  const members = await tx.query.user.findMany({
    where: and(eq(user.tenantId, tenantId), inArray(user.id, memberIds)),
    columns: {
      id: true,
      name: true,
      email: true,
    },
  });

  if (members.length === 0) {
    return [];
  }

  const resolvedMemberIds: string[] = members
    .map((m: Record<string, unknown>) => m.id)
    .filter((memberId: unknown): memberId is string => typeof memberId === 'string');

  // Fetch claims for these members (excluding drafts).
  // db-access-guard: tenant-scoped -- reason: tenant predicate built by visibility helper and consumed by this DB call
  const memberClaims = await tx.query.claims.findMany({
    where: and(
      buildAgentClaimsWhere({ tenantId, memberIds: resolvedMemberIds, branchId }),
      claimLifecycleStatusNotIn(['draft'])
    ),
    orderBy: desc(claims.updatedAt),
    columns: {
      id: true,
      title: true,
      caseLifecycleState: true,
      recoveryLifecycleState: true,
      createdAt: true,
      updatedAt: true,
      userId: true,
    },
  });

  return mapAgentMemberClaimGroups(members, memberClaims);
}

/**
 * Core logic for the Agent Claims Page.
 * Validates the exercised role, then reads members managed by the agent and their claims
 * inside one tenant-context transaction, grouped by member.
 */
export async function getAgentClaimsCore(params: {
  tenantId: string;
  userId: string;
  role?: string | null;
  branchId?: string | null;
}): Promise<AgentClaimsResult> {
  const { tenantId, userId, role, branchId } = params;

  if (typeof role !== 'string' || !AGENT_CLAIMS_READER_ROLES.includes(role)) {
    return { ok: false, code: 'FORBIDDEN' };
  }

  try {
    const data = await withTenantContext({ tenantId, role }, tx =>
      readAgentMemberClaimGroups(tx, { tenantId, userId, branchId })
    );
    return { ok: true, data };
  } catch (error) {
    console.error('[AgentClaimsCore] Error assembling dashboard:', error);
    return { ok: false, code: 'INTERNAL' };
  }
}
