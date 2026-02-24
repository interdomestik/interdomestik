import { claimMessages, claims, user } from '@interdomestik/database/schema';
import { and, count, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';

export interface AgentProClaimDTO {
  id: string;
  title: string;
  claimNumber: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  member: {
    id: string;
    name: string;
    email: string;
  } | null;
  branch: {
    name: string;
  } | null;
  unreadCount: number;
  lastMessage: string | null;
  policy: null;
}

export interface AgentWorkspaceClaimsResult {
  claims: AgentProClaimDTO[];
}

const WORKSPACE_CLAIM_LIMIT = 100;

type ClaimRow = {
  id: string;
  title: string | null;
  claimNumber: string | null;
  status: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  user?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  branch?: {
    name: string | null;
  } | null;
};

function normalizeClaimDate(value: Date | string | null): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return new Date();
}

function mapToAgentProClaim(c: ClaimRow): AgentProClaimDTO {
  return {
    id: c.id,
    title: c.title ?? 'Untitled',
    claimNumber: c.claimNumber ?? 'N/A',
    status: c.status ?? 'draft',
    createdAt: normalizeClaimDate(c.createdAt),
    updatedAt: normalizeClaimDate(c.updatedAt),
    member: c.user
      ? {
          id: c.user.id,
          name: c.user.name ?? '',
          email: c.user.email,
        }
      : null,
    branch: c.branch
      ? {
          name: c.branch.name ?? 'N/A',
        }
      : null,
    unreadCount: 0,
    lastMessage: null,
    policy: null,
  };
}

function dedupeClaimsById(claims: AgentProClaimDTO[]): AgentProClaimDTO[] {
  const seen = new Set<string>();
  return claims.filter(claim => {
    if (seen.has(claim.id)) return false;
    seen.add(claim.id);
    return true;
  });
}

/**
 * Pure helper for the claims where clause.
 */
export function buildAgentWorkspaceClaimsWhere(params: {
  tenantId: string;
  branchId?: string | null;
}) {
  if (params.branchId) {
    return and(
      eq(claims.tenantId, params.tenantId),
      or(eq(claims.branchId, params.branchId), isNull(claims.branchId))
    );
  }
  return eq(claims.tenantId, params.tenantId);
}

function buildAgentWorkspaceClaimByIdWhere(params: {
  tenantId: string;
  branchId?: string | null;
  claimId: string;
}) {
  return and(buildAgentWorkspaceClaimsWhere(params), eq(claims.id, params.claimId));
}

async function getClaimByIdInWorkspaceScope(params: {
  tenantId: string;
  branchId?: string | null;
  claimId: string;
  db: any;
}): Promise<AgentProClaimDTO | null> {
  const { tenantId, claimId, branchId, db } = params;

  const matched = await db.query.claims.findMany({
    where: buildAgentWorkspaceClaimByIdWhere({ tenantId, branchId, claimId }),
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

function buildUnreadMessagesWhere(params: { userId: string; claimIds: string[] }) {
  return and(
    inArray(claimMessages.claimId, params.claimIds),
    isNull(claimMessages.readAt),
    ne(claimMessages.senderId, params.userId)
  );
}

/**
 * Pure core logic for the Agent Workspace Claims Page.
 * Fetches claims, unread counts, and last message snippets.
 */
export async function getAgentWorkspaceClaimsCore(params: {
  tenantId: string;
  userId: string;
  db: any;
  selectedClaimId?: string;
}): Promise<AgentWorkspaceClaimsResult> {
  const { tenantId, userId, db, selectedClaimId } = params;
  const requestedSelectedClaimId =
    typeof selectedClaimId === 'string' && selectedClaimId.trim() !== ''
      ? selectedClaimId.trim()
      : null;

  // 0. Fetch Agent Context (Branch)
  const agent = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { branchId: true },
  });

  // 1. Fetch Claims for Agent's Scope
  const claimsData = await db.query.claims.findMany({
    where: buildAgentWorkspaceClaimsWhere({ tenantId, branchId: agent?.branchId }),
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
    // 3. Fetch Unread Counts (incoming messages only)
    const unreadCounts = await db
      .select({
        claimId: claimMessages.claimId,
        count: count(claimMessages.id),
      })
      .from(claimMessages)
      .where(buildUnreadMessagesWhere({ userId, claimIds: metadataClaimIds }))
      .groupBy(claimMessages.claimId);

    unreadCounts.forEach((row: Record<string, unknown>) =>
      unreadMap.set(row.claimId as string, Number(row.count))
    );

    // 4. Fetch Last Messages (using selectDistinctOn for PG or manual aggregation if needed)
    const lastMessages = await db
      .selectDistinctOn([claimMessages.claimId], {
        claimId: claimMessages.claimId,
        content: claimMessages.content,
        createdAt: claimMessages.createdAt,
      })
      .from(claimMessages)
      .where(inArray(claimMessages.claimId, metadataClaimIds))
      .orderBy(claimMessages.claimId, desc(claimMessages.createdAt));

    lastMessages.forEach((row: Record<string, unknown>) =>
      snippetMap.set(row.claimId as string, row.content as string)
    );
  }

  if (selectedClaim) {
    selectedClaim.unreadCount = unreadMap.get(selectedClaim.id) || 0;
    selectedClaim.lastMessage = snippetMap.get(selectedClaim.id) || null;
  }

  const mappedClaims: AgentProClaimDTO[] = claimsData.map((c: any) => {
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
