import { withTenantContext, type TenantTransaction } from '@interdomestik/database';
import { agentClients, claimMessages, claims, user } from '@interdomestik/database/schema';
import { ROLES } from '@interdomestik/shared-auth';
import { and, count, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';

import type { AgentProClaimDTO, ClaimRow } from './_dto';
import { dedupeClaimsById, mapToAgentProClaim } from './_dto';

export type { AgentProClaimDTO } from './_dto';

export interface AgentWorkspaceClaimsResult {
  claims: AgentProClaimDTO[];
}

export type AgentWorkspaceClaimsCoreResult =
  ({ ok: true } & AgentWorkspaceClaimsResult) | { ok: false; code: 'FORBIDDEN' };

const WORKSPACE_CLAIM_LIMIT = 100;

const AGENT_WORKSPACE_READER_ROLES = [
  ROLES.agent,
  ROLES.admin,
  ROLES.tenant_admin,
  ROLES.super_admin,
] as readonly string[];

export function buildAgentWorkspaceClaimsWhere(params: {
  tenantId: string;
  assignedMemberIds: string[];
  branchId?: string | null;
}) {
  const assignedMembers = inArray(claims.userId, params.assignedMemberIds);

  if (params.branchId) {
    return and(
      eq(claims.tenantId, params.tenantId),
      assignedMembers,
      or(eq(claims.branchId, params.branchId), isNull(claims.branchId))
    );
  }

  return and(eq(claims.tenantId, params.tenantId), assignedMembers);
}

function buildAgentWorkspaceClaimByIdWhere(params: {
  tenantId: string;
  assignedMemberIds: string[];
  branchId?: string | null;
  claimId: string;
}) {
  return and(buildAgentWorkspaceClaimsWhere(params), eq(claims.id, params.claimId));
}

async function getClaimByIdInWorkspaceScope(
  tx: TenantTransaction,
  params: {
    tenantId: string;
    assignedMemberIds: string[];
    branchId?: string | null;
    claimId: string;
  }
): Promise<AgentProClaimDTO | null> {
  const { tenantId, claimId, assignedMemberIds, branchId } = params;

  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  const matched = await tx.query.claims.findMany({
    where: buildAgentWorkspaceClaimByIdWhere({ tenantId, assignedMemberIds, branchId, claimId }),
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
      branch: {
        columns: {
          name: true,
        },
      },
    },
    limit: 1,
  });

  if (!matched.length) return null;
  return mapToAgentProClaim(matched[0] as ClaimRow);
}

function buildVisibleMessagesWhere(tenantId: string, claimIds: string[]) {
  // Match the public conversation reader; internal and unspecified visibility stay private.
  return and(
    eq(claimMessages.tenantId, tenantId),
    inArray(claimMessages.claimId, claimIds),
    eq(claimMessages.isInternal, false)
  );
}

async function readAgentWorkspaceClaims(
  tx: TenantTransaction,
  params: { tenantId: string; userId: string; requestedSelectedClaimId: string | null }
): Promise<AgentWorkspaceClaimsResult | null> {
  const { tenantId, userId, requestedSelectedClaimId } = params;

  // 0. Fetch Agent Context (Branch)
  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  const agent = await tx.query.user.findFirst({
    where: and(eq(user.id, userId), eq(user.tenantId, tenantId)),
    columns: { branchId: true },
  });

  // Fail closed: a missing row (access/home-tenant mismatch, revoked or deleted identity) must
  // never degrade to an unfiltered branch scope. A present row with branchId null stays valid.
  if (!agent) return null;

  const activeAssignments = await tx.query.agentClients.findMany({
    where: and(
      eq(agentClients.tenantId, tenantId),
      eq(agentClients.agentId, userId),
      eq(agentClients.status, 'active')
    ),
    columns: { memberId: true },
  });
  const assignedMemberIds: string[] = Array.from(
    new Set(
      activeAssignments
        .map((assignment: { memberId: string | null }) => assignment.memberId)
        .filter(
          (memberId: string | null): memberId is string =>
            typeof memberId === 'string' && memberId.length > 0
        )
    )
  );

  if (assignedMemberIds.length === 0) {
    return { claims: [] };
  }

  // 1. Fetch Claims for Agent's Scope
  // db-access-guard: tenant-scoped -- reason: tenant predicate built by local helper and consumed by this DB call
  const claimsData = await tx.query.claims.findMany({
    where: buildAgentWorkspaceClaimsWhere({
      tenantId,
      assignedMemberIds,
      branchId: agent.branchId,
    }),
    orderBy: [desc(claims.createdAt)],
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
      branch: {
        columns: {
          name: true,
        },
      },
    },
    limit: WORKSPACE_CLAIM_LIMIT,
  });

  const claimIds = (claimsData as Record<string, unknown>[]).map(c => c.id as string);

  // 2. Resolve direct selection by claimId even when not in first-page results.
  const selectedClaim = requestedSelectedClaimId
    ? claimIds.includes(requestedSelectedClaimId)
      ? null
      : await getClaimByIdInWorkspaceScope(tx, {
          tenantId,
          assignedMemberIds,
          claimId: requestedSelectedClaimId,
          branchId: agent.branchId,
        })
    : null;

  const metadataClaimIds =
    selectedClaim && !claimIds.includes(selectedClaim.id)
      ? [...claimIds, selectedClaim.id]
      : claimIds;
  const unreadMap = new Map<string, number>();
  const snippetMap = new Map<string, string>();

  if (metadataClaimIds.length > 0) {
    // db-access-guard: tenant-scoped -- reason: tenant predicate built by local helper and consumed by this DB call
    const unreadCounts = await tx
      .select({
        claimId: claimMessages.claimId,
        count: count(claimMessages.id),
      })
      .from(claimMessages)
      .where(
        and(
          buildVisibleMessagesWhere(tenantId, metadataClaimIds),
          isNull(claimMessages.readAt),
          ne(claimMessages.senderId, userId)
        )
      )
      .groupBy(claimMessages.claimId);

    unreadCounts.forEach((row: Record<string, unknown>) =>
      unreadMap.set(row.claimId as string, Number(row.count))
    );
    // db-access-guard: tenant-scoped -- reason: buildVisibleMessagesWhere enforces tenant, visible claim ids and public messages
    const lastMessages = await tx
      .selectDistinctOn([claimMessages.claimId], {
        claimId: claimMessages.claimId,
        content: claimMessages.content,
        createdAt: claimMessages.createdAt,
      })
      .from(claimMessages)
      .where(buildVisibleMessagesWhere(tenantId, metadataClaimIds))
      .orderBy(claimMessages.claimId, desc(claimMessages.createdAt));

    lastMessages.forEach((row: Record<string, unknown>) =>
      snippetMap.set(row.claimId as string, row.content as string)
    );
  }

  if (selectedClaim) {
    selectedClaim.unreadCount = unreadMap.get(selectedClaim.id) || 0;
    selectedClaim.lastMessage = snippetMap.get(selectedClaim.id) || null;
  }

  const mappedClaims: AgentProClaimDTO[] = claimsData.map(c => {
    const dto = mapToAgentProClaim(c as ClaimRow);
    dto.unreadCount = unreadMap.get(dto.id) || 0;
    dto.lastMessage = snippetMap.get(dto.id) || null;
    return dto;
  });

  const sortedClaims = dedupeClaimsById(
    selectedClaim ? [...mappedClaims, selectedClaim] : mappedClaims
  ).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const cappedClaims = sortedClaims.slice(0, WORKSPACE_CLAIM_LIMIT);

  if (!requestedSelectedClaimId) {
    return { claims: cappedClaims };
  }

  if (cappedClaims.some(claim => claim.id === requestedSelectedClaimId)) {
    return { claims: cappedClaims };
  }

  const selectedFromWorkspaceScope = sortedClaims.find(
    claim => claim.id === requestedSelectedClaimId
  );

  if (!selectedFromWorkspaceScope) {
    return { claims: cappedClaims };
  }

  const claimsWithForcedSelection = [
    ...cappedClaims.slice(0, WORKSPACE_CLAIM_LIMIT - 1),
    selectedFromWorkspaceScope,
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  return { claims: claimsWithForcedSelection };
}

/**
 * Validates the exercised role, then performs the whole workspace read closure inside one
 * tenant-context transaction. Database failures propagate to the route error boundary.
 */
export async function getAgentWorkspaceClaimsCore(params: {
  tenantId: string;
  userId: string;
  role?: string | null;
  selectedClaimId?: string;
}): Promise<AgentWorkspaceClaimsCoreResult> {
  const { tenantId, userId, role, selectedClaimId } = params;

  if (typeof role !== 'string' || !AGENT_WORKSPACE_READER_ROLES.includes(role)) {
    return { ok: false, code: 'FORBIDDEN' };
  }

  const requestedSelectedClaimId =
    typeof selectedClaimId === 'string' && selectedClaimId.trim() !== ''
      ? selectedClaimId.trim()
      : null;

  const result = await withTenantContext({ tenantId, role }, tx =>
    readAgentWorkspaceClaims(tx, { tenantId, userId, requestedSelectedClaimId })
  );

  if (!result) {
    return { ok: false, code: 'FORBIDDEN' };
  }

  return { ok: true, claims: result.claims };
}
