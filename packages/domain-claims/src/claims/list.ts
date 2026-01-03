import {
  agentClients,
  and,
  claimMessages,
  claims,
  db,
  eq,
  ilike,
  inArray,
  or,
  user,
} from '@interdomestik/database';
import { CLAIM_STATUSES } from '@interdomestik/database/constants';
import { scopeFilter, type SessionWithTenant } from '@interdomestik/shared-auth';
import { SQL, count, desc, isNotNull, isNull, ne } from 'drizzle-orm';

export type ClaimsScope =
  | 'member'
  | 'admin'
  | 'staff_queue'
  | 'staff_all'
  | 'staff_unassigned'
  | 'agent_queue';

export type ClaimItem = {
  id: string;
  title: string | null;
  status: string | null;
  createdAt: string | null;
  companyName: string | null;
  claimAmount: string | null;
  currency: string | null;
  category: string | null;
  claimantName?: string | null;
  claimantEmail?: string | null;
  unreadCount?: number;
};

export type ClaimsListResponse = {
  success: boolean;
  claims?: ClaimItem[];
  page?: number;
  perPage?: number;
  totalCount?: number;
  totalPages?: number;
  error?: string;
};

export type ListClaimsParams = {
  session: SessionWithTenant;
  scope: ClaimsScope;
  status?: string;
  search?: string;
  page: number;
  perPage: number;
};

const VALID_STATUSES = CLAIM_STATUSES;

export async function listClaims(params: ListClaimsParams): Promise<ClaimsListResponse> {
  const { session, scope, status: statusFilter, search: searchQuery, page, perPage } = params;

  const role = session?.user?.role || 'user';
  const isAgent = role === 'agent';

  // Calculate Authentication Scope
  const authScope = scopeFilter(session);
  const tenantId = authScope.tenantId;

  // Permission Checks based on requested scope param
  if (scope === 'admin' && !authScope.isFullTenantScope) {
    // If not full tenant scope, cannot request generic 'admin' view
    // (Only Tenant Admin / Staff can see 'admin' view? Or just Admin?)
    // _core.ts logic was: `if (scope === 'admin' && !authScope.isFullTenantScope)`
    // Branch Manager !isFullTenantScope.
    return { success: false, error: 'Unauthorized' };
  }

  // Branch managers and Staff can access staff queues
  const isPrivileged = authScope.isFullTenantScope || !!authScope.branchId;

  if (
    (scope === 'staff_queue' || scope === 'staff_all' || scope === 'staff_unassigned') &&
    !isPrivileged
  ) {
    return { success: false, error: 'Unauthorized' };
  }

  // Agents access agent_queue
  if (scope === 'agent_queue' && !authScope.agentId && !isPrivileged) {
    return { success: false, error: 'Unauthorized' };
  }

  const conditions: SQL<unknown>[] = [];

  conditions.push(eq(claims.tenantId, tenantId));

  const useAgentClientsJoin =
    scope === 'agent_queue' && !!authScope.agentId && !authScope.isFullTenantScope;
  const agentClientsJoinOn = useAgentClientsJoin
    ? and(
        eq(agentClients.memberId, claims.userId),
        eq(agentClients.agentId, authScope.agentId!),
        eq(agentClients.tenantId, tenantId),
        eq(agentClients.status, 'active')
      )
    : null;

  // Apply Mandatory Scoping (Branch / Agent)
  if (!authScope.isFullTenantScope) {
    // If user has branch scope, restrict to branch claims
    if (authScope.branchId) {
      conditions.push(eq(claims.branchId, authScope.branchId));
    }
    // If user has agent scope, restrict to claims where they are the agent
    // NOTE: For agent_queue, visibility is derived from canonical ownership (agent_clients).
    if (authScope.agentId && scope !== 'agent_queue') {
      conditions.push(eq(claims.agentId, authScope.agentId));
    }
  }

  if (scope === 'member') {
    conditions.push(eq(claims.userId, session!.user!.id!));
  }

  if (scope === 'staff_queue' && isPrivileged) {
    conditions.push(eq(claims.staffId, session!.user!.id!));
  }

  if (scope === 'staff_unassigned') {
    conditions.push(isNull(claims.staffId));
    conditions.push(ne(claims.status, 'draft'));
  }

  if (scope === 'agent_queue') {
    if (isPrivileged) {
      conditions.push(isNotNull(claims.agentId));
    }
  }

  if (statusFilter && (VALID_STATUSES as readonly string[]).includes(statusFilter)) {
    conditions.push(eq(claims.status, statusFilter as (typeof VALID_STATUSES)[number]));
  }

  if (searchQuery) {
    const searchCondition =
      scope === 'member'
        ? or(ilike(claims.title, `%${searchQuery}%`), ilike(claims.companyName, `%${searchQuery}%`))
        : or(
            ilike(claims.title, `%${searchQuery}%`),
            ilike(claims.companyName, `%${searchQuery}%`),
            ilike(user.name, `%${searchQuery}%`),
            ilike(user.email, `%${searchQuery}%`)
          );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;

  let countQuery = db
    .select({ total: count() })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id));

  if (agentClientsJoinOn) {
    countQuery = countQuery.innerJoin(agentClients, agentClientsJoinOn);
  }

  const [countRow] = await countQuery.where(whereClause);

  const totalCount = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const offset = (page - 1) * perPage;

  let rowsQuery = db
    .select({
      id: claims.id,
      title: claims.title,
      status: claims.status,
      createdAt: claims.createdAt,
      companyName: claims.companyName,
      claimAmount: claims.claimAmount,
      currency: claims.currency,
      category: claims.category,
      claimantName: user.name,
      claimantEmail: user.email,
    })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id));

  if (agentClientsJoinOn) {
    rowsQuery = rowsQuery.innerJoin(agentClients, agentClientsJoinOn);
  }

  const rows = await rowsQuery
    .where(whereClause)
    .orderBy(desc(claims.createdAt))
    .limit(perPage)
    .offset(offset);

  const unreadCounts = new Map<string, number>();

  if (scope !== 'member' && rows.length > 0) {
    const unreadRows = await db
      .select({
        claimId: claimMessages.claimId,
        total: count(),
      })
      .from(claimMessages)
      .innerJoin(claims, eq(claimMessages.claimId, claims.id))
      .where(
        and(
          inArray(
            claimMessages.claimId,
            rows.map(row => row.id)
          ),
          isNull(claimMessages.readAt),
          eq(claimMessages.senderId, claims.userId),
          eq(claims.tenantId, tenantId)
        )
      )
      .groupBy(claimMessages.claimId);

    for (const row of unreadRows) {
      unreadCounts.set(row.claimId, Number(row.total || 0));
    }
  }

  const redactForAgent = scope === 'agent_queue' && isAgent;

  return {
    success: true,
    claims: rows.map(row => ({
      id: row.id,
      title: redactForAgent ? null : row.title,
      status: row.status,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      companyName: redactForAgent ? null : row.companyName,
      claimAmount: redactForAgent ? null : row.claimAmount,
      currency: redactForAgent ? null : row.currency,
      category: redactForAgent ? null : row.category,
      claimantName: redactForAgent ? null : row.claimantName,
      claimantEmail: redactForAgent ? null : row.claimantEmail,
      unreadCount: scope === 'member' || redactForAgent ? 0 : unreadCounts.get(row.id) || 0,
    })),
    page,
    perPage,
    totalCount,
    totalPages,
  };
}
