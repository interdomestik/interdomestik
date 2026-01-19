import { claimMessages, claims } from '@interdomestik/database/schema';
import { and, count, desc, eq, inArray, isNull, ne } from 'drizzle-orm';

export interface AgentProClaimDTO {
  id: string;
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

/**
 * Pure helper for the claims where clause.
 */
export function buildAgentWorkspaceClaimsWhere(params: { tenantId: string }) {
  return eq(claims.tenantId, params.tenantId);
}

/**
 * Pure helper for unread messages where clause.
 * Must exclude agent's own messages and scope to specific claims.
 */
export function buildUnreadMessagesWhere(params: { userId: string; claimIds: string[] }) {
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
}): Promise<AgentWorkspaceClaimsResult> {
  const { tenantId, userId, db } = params;

  // 1. Fetch Claims for Agent's Tenant
  const claimsData = await db.query.claims.findMany({
    where: buildAgentWorkspaceClaimsWhere({ tenantId }),
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
    limit: 100,
  });

  const claimIds = claimsData.map((c: Record<string, unknown>) => c.id as string);
  const unreadMap = new Map<string, number>();
  const snippetMap = new Map<string, string>();

  if (claimIds.length > 0) {
    // 2. Fetch Unread Counts (incoming messages only)
    const unreadCounts = await db
      .select({
        claimId: claimMessages.claimId,
        count: count(claimMessages.id),
      })
      .from(claimMessages)
      .where(buildUnreadMessagesWhere({ userId, claimIds }))
      .groupBy(claimMessages.claimId);

    unreadCounts.forEach((row: Record<string, unknown>) =>
      unreadMap.set(row.claimId as string, Number(row.count))
    );

    // 3. Fetch Last Messages (using selectDistinctOn for PG or manual aggregation if needed)
    const lastMessages = await db
      .selectDistinctOn([claimMessages.claimId], {
        claimId: claimMessages.claimId,
        content: claimMessages.content,
        createdAt: claimMessages.createdAt,
      })
      .from(claimMessages)
      .where(inArray(claimMessages.claimId, claimIds))
      .orderBy(claimMessages.claimId, desc(claimMessages.createdAt));

    lastMessages.forEach((row: Record<string, unknown>) =>
      snippetMap.set(row.claimId as string, row.content as string)
    );
  }

  // 4. Map to DTOs
  const mappedClaims: AgentProClaimDTO[] = (claimsData as any[]).map((c: any) => ({
    id: c.id,
    claimNumber: c.claimNumber ?? 'N/A',
    status: c.status ?? 'draft',
    createdAt: c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt),
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt : new Date(c.updatedAt),
    member: c.user
      ? {
          id: c.user.id,
          name: c.user.name ?? '',
          email: c.user.email,
        }
      : null,
    branch: c.branch
      ? {
          name: c.branch.name,
        }
      : null,
    unreadCount: unreadMap.get(c.id) || 0,
    lastMessage: snippetMap.get(c.id) || null,
    policy: null,
  }));

  return { claims: mappedClaims };
}
