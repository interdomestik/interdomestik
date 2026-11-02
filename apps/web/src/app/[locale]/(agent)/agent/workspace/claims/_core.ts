import { agentClients, claimMessages, claims, user } from '@interdomestik/database/schema';
import type * as DatabaseModule from '@interdomestik/database';
import { and, count, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import {
  dedupeClaimsById,
  mapToAgentProClaim,
  type AgentProClaimDTO,
  type AgentWorkspaceClaimsResult,
  type ClaimRow,
} from './claim-mapping';
export type { AgentProClaimDTO, AgentWorkspaceClaimsResult } from './claim-mapping';

// Runtime callers pass the tenant transaction so RLS scopes every read to the session tenant.
type DatabaseClient = typeof DatabaseModule.db | DatabaseModule.TenantTransaction;

const WORKSPACE_CLAIM_LIMIT = 100;

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

async function getClaimByIdInWorkspaceScope(params: {
  tenantId: string;
  assignedMemberIds: string[];
  branchId?: string | null;
  claimId: string;
  db: DatabaseClient;
}): Promise<AgentProClaimDTO | null> {
  const { tenantId, claimId, assignedMemberIds, branchId, db } = params;

  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  const matched = await db.query.claims.findMany({
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

export async function getAgentWorkspaceClaimsCore(params: {
  tenantId: string;
  userId: string;
  db: DatabaseClient;
  selectedClaimId?: string;
}): Promise<AgentWorkspaceClaimsResult> {
  const { tenantId, userId, db, selectedClaimId } = params;
  const requestedSelectedClaimId =
    typeof selectedClaimId === 'string' && selectedClaimId.trim() !== ''
      ? selectedClaimId.trim()
      : null;

  // 0. Fetch Agent Context (Branch)
  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  const agent = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { branchId: true },
  });
  const activeAssignments = await db.query.agentClients.findMany({
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
  const claimsData = await db.query.claims.findMany({
    where: buildAgentWorkspaceClaimsWhere({
      tenantId,
      assignedMemberIds,
      branchId: agent?.branchId,
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
      : await getClaimByIdInWorkspaceScope({
          tenantId,
          assignedMemberIds,
          claimId: requestedSelectedClaimId,
          branchId: agent?.branchId,
          db,
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
    const unreadCounts = await db
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
    const lastMessages = await db
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
