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
import { withTenant } from '@interdomestik/database/tenant-security';
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

  // 1. Auth & Scope Validation
  const authScope = scopeFilter(session);
  const access = validateClaimsAccess(scope, authScope, session);

  if (!access.allowed) {
    return { success: false, error: 'Unauthorized' };
  }

  const { isPrivileged } = access;
  const tenantId = authScope.tenantId;
  const role = session?.user?.role || 'user';
  const isAgent = role === 'agent';

  // 2. Build Query Conditions
  const agentClientsJoinOn = buildAgentClientsJoin(scope, authScope, tenantId);
  const whereClause = buildClaimsWhereClause({
    scope,
    authScope,
    tenantId,
    session,
    isPrivileged,
    statusFilter,
    searchQuery,
  });

  // 3. Fetch Data
  const { totalCount, totalPages, rows } = await executeClaimsQuery(
    whereClause,
    agentClientsJoinOn,
    page,
    perPage
  );

  // 4. Fetch Metadata & Map Response
  const unreadCounts = await fetchUnreadCounts({
    rows,
    scope,
    tenantId,
  });

  return {
    success: true,
    claims: mapClaimsToResponse(rows, scope, isAgent, unreadCounts),
    page,
    perPage,
    totalCount,
    totalPages,
  };
}

function validateClaimsAccess(
  scope: ClaimsScope,
  authScope: any,
  session: SessionWithTenant
): { allowed: boolean; isPrivileged?: boolean } {
  // Permission Checks based on requested scope param
  if (scope === 'admin' && !authScope.isFullTenantScope) {
    return { allowed: false };
  }

  // Branch managers and Staff can access staff queues
  const isPrivileged = authScope.isFullTenantScope || !!authScope.branchId;

  if (
    (scope === 'staff_queue' || scope === 'staff_all' || scope === 'staff_unassigned') &&
    !isPrivileged
  ) {
    return { allowed: false };
  }

  // Agents access agent_queue
  if (scope === 'agent_queue' && !authScope.agentId && !isPrivileged) {
    return { allowed: false };
  }

  return { allowed: true, isPrivileged };
}

function buildAgentClientsJoin(scope: ClaimsScope, authScope: any, tenantId: string) {
  const useAgentClientsJoin =
    scope === 'agent_queue' && !!authScope.agentId && !authScope.isFullTenantScope;

  return useAgentClientsJoin
    ? withTenant(
        tenantId,
        agentClients.tenantId,
        and(
          eq(agentClients.memberId, claims.userId),
          eq(agentClients.agentId, authScope.agentId!),
          eq(agentClients.status, 'active')
        )
      )
    : null;
}

function buildClaimsWhereClause(params: {
  scope: ClaimsScope;
  authScope: any;
  tenantId: string;
  session: SessionWithTenant;
  isPrivileged?: boolean;
  statusFilter?: string;
  searchQuery?: string;
}) {
  // NOSONAR
  const { scope, authScope, tenantId, session, isPrivileged, statusFilter, searchQuery } = params;
  const conditions: SQL<unknown>[] = [];

  // 1. Mandatory Scoping
  conditions.push(...buildScopeConditions(authScope, scope, session, isPrivileged));

  // 2. Status Filter
  if (statusFilter && (VALID_STATUSES as readonly string[]).includes(statusFilter)) {
    conditions.push(eq(claims.status, statusFilter as (typeof VALID_STATUSES)[number])); // NOSONAR
  }

  // 3. Search Query
  if (searchQuery) {
    const searchCondition = buildSearchConditions(scope, searchQuery);
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const baseWhere = conditions.length ? and(...conditions) : undefined;
  return withTenant(tenantId, claims.tenantId, baseWhere);
}

function buildScopeConditions(
  authScope: any,
  scope: ClaimsScope,
  session: SessionWithTenant,
  isPrivileged?: boolean
): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];

  // Branch / Agent Scoping
  if (!authScope.isFullTenantScope) {
    if (authScope.branchId) {
      conditions.push(eq(claims.branchId, authScope.branchId));
    }
    if (authScope.agentId && scope !== 'agent_queue') {
      conditions.push(eq(claims.agentId, authScope.agentId));
    }
  }

  // View Scope
  if (scope === 'member') {
    conditions.push(eq(claims.userId, session!.user!.id!));
  } else if (scope === 'staff_queue' && isPrivileged) {
    conditions.push(eq(claims.staffId, session!.user!.id!));
  } else if (scope === 'staff_unassigned') {
    conditions.push(isNull(claims.staffId));
    conditions.push(ne(claims.status, 'draft'));
  } else if (scope === 'agent_queue' && isPrivileged) {
    conditions.push(isNotNull(claims.agentId));
  }

  return conditions;
}

function buildSearchConditions(scope: ClaimsScope, searchQuery: string) {
  const term = `%${searchQuery}%`;

  if (scope === 'member') {
    return or(ilike(claims.title, term), ilike(claims.companyName, term));
  }

  return or(
    ilike(claims.title, term),
    ilike(claims.companyName, term),
    ilike(user.name, term),
    ilike(user.email, term)
  );
}

async function executeClaimsQuery(
  whereClause: SQL | undefined,
  agentClientsJoinOn: any,
  page: number,
  perPage: number
) {
  const totalCount = await fetchTotalCount(whereClause, agentClientsJoinOn);
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const offset = (page - 1) * perPage;

  const rows = await fetchClaimRows({
    whereClause,
    agentClientsJoinOn,
    perPage,
    offset,
  });

  return { totalCount, totalPages, rows };
}

async function fetchTotalCount(whereClause: SQL | undefined, agentClientsJoinOn: any) {
  let countQuery = db
    .select({ total: count() })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id));

  if (agentClientsJoinOn) {
    countQuery = countQuery.innerJoin(agentClients, agentClientsJoinOn);
  }

  const [countRow] = await countQuery.where(whereClause);
  return Number(countRow?.total || 0);
}

async function fetchClaimRows(params: {
  whereClause: SQL | undefined;
  agentClientsJoinOn: any;
  perPage: number;
  offset: number;
}) {
  const { whereClause, agentClientsJoinOn, perPage, offset } = params;

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

  return await rowsQuery
    .where(whereClause)
    .orderBy(desc(claims.createdAt))
    .limit(perPage)
    .offset(offset);
}

async function fetchUnreadCounts(params: {
  rows: { id: string }[];
  scope: ClaimsScope;
  tenantId: string;
}) {
  const { rows, scope, tenantId } = params;
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
        withTenant(
          tenantId,
          claims.tenantId,
          and(
            inArray(
              claimMessages.claimId,
              rows.map(row => row.id)
            ),
            isNull(claimMessages.readAt),
            eq(claimMessages.senderId, claims.userId)
          )
        )
      )
      .groupBy(claimMessages.claimId);

    for (const row of unreadRows) {
      unreadCounts.set(row.claimId, Number(row.total || 0));
    }
  }
  return unreadCounts;
}

function mapClaimsToResponse(
  rows: any[],
  scope: ClaimsScope,
  isAgent: boolean,
  unreadCounts: Map<string, number>
) {
  const redactForAgent = scope === 'agent_queue' && isAgent;

  return rows.map(row => ({
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
  }));
}
