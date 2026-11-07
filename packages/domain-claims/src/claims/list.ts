import {
  agentClients,
  and,
  claimMessages,
  claims,
  eq,
  ilike,
  inArray,
  or,
  user,
} from '@interdomestik/database';
import { CLAIM_STATUSES } from '@interdomestik/database/constants';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { scopeFilter, type SessionWithTenant } from '@interdomestik/shared-auth';
import { SQL, count, desc, isNotNull, isNull } from 'drizzle-orm';
import { claimLifecycleStatusIn, claimLifecycleStatusSql } from './lifecycle-read-sql';
import { listDraftExclusion } from './list-draft-scope';
import { mapClaimsToResponse } from './list-response';
import type { ClaimsListResponse, ClaimsScope, ListClaimsParams } from './list-types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export type { ClaimItem, ClaimsListResponse, ClaimsScope, ListClaimsParams } from './list-types';

const VALID_STATUSES = CLAIM_STATUSES;

export async function listClaims(params: ListClaimsParams): Promise<ClaimsListResponse> {
  const {
    authority,
    session,
    scope,
    status: statusFilter,
    search: searchQuery,
    page,
    perPage,
  } = params;

  // 1. Auth & Scope Validation
  const authScope = scopeFilter(session);
  const access = validateClaimsAccess(scope, authScope, session);

  if (!access.allowed) {
    return { success: false, error: 'Unauthorized' };
  }

  const { isPrivileged } = access;
  const { tenantId } = readTenantAuthority(authority);
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
    perPage,
    authority
  );

  // 4. Fetch Metadata & Map Response
  const unreadCounts = await fetchUnreadCounts({
    authority,
    rows,
    scope,
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
    conditions.push(claimLifecycleStatusIn([statusFilter as (typeof VALID_STATUSES)[number]]));
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

function buildScopeConditions( // NOSONAR - complexity justified by RBAC requirements
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
  const userId = session?.user?.id;

  if (scope === 'member') {
    if (!userId) throw new Error('User ID required for member scope');
    conditions.push(eq(claims.userId, userId));
  } else if (scope === 'staff_queue' && isPrivileged) {
    if (!userId) throw new Error('User ID required for staff queue');
    conditions.push(eq(claims.staffId, userId));
  } else if (scope === 'staff_unassigned') {
    conditions.push(isNull(claims.staffId));
  } else if (scope === 'agent_queue' && isPrivileged) {
    conditions.push(isNotNull(claims.agentId));
  }
  conditions.push(...listDraftExclusion(scope, session));
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
    ilike(claims.claimNumber, term),
    ilike(user.name, term),
    ilike(user.email, term)
  );
}

async function executeClaimsQuery(
  whereClause: SQL | undefined,
  agentClientsJoinOn: any,
  page: number,
  perPage: number,
  authority: TenantAuthority
) {
  const totalCount = await fetchTotalCount(whereClause, agentClientsJoinOn, authority);
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const offset = (page - 1) * perPage;

  const rows = await fetchClaimRows({
    whereClause,
    agentClientsJoinOn,
    perPage,
    offset,
    authority,
  });

  return { totalCount, totalPages, rows };
}

async function fetchTotalCount(
  whereClause: SQL | undefined,
  agentClientsJoinOn: any,
  authority: TenantAuthority
) {
  // db-access-guard: tenant-scoped -- reason: tenant predicate built by local helper and consumed by this DB call
  const [countRow] = await withTenantAuthority(authority, tx => {
    let countQuery = tx
      .select({ total: count() })
      .from(claims)
      .leftJoin(user, eq(claims.userId, user.id));

    if (agentClientsJoinOn) {
      countQuery = countQuery.innerJoin(agentClients, agentClientsJoinOn);
    }

    return countQuery.where(whereClause);
  });
  return Number(countRow?.total || 0);
}

async function fetchClaimRows(params: {
  whereClause: SQL | undefined;
  agentClientsJoinOn: any;
  perPage: number;
  offset: number;
  authority: TenantAuthority;
}) {
  const { whereClause, agentClientsJoinOn, perPage, offset, authority } = params;

  // db-access-guard: tenant-scoped -- reason: tenant predicate built by local helper and consumed by this DB call
  return withTenantAuthority(authority, async tx => {
    let rowsQuery = tx
      .select({
        id: claims.id,
        title: claims.title,
        status: claimLifecycleStatusSql(),
        caseLifecycleState: claims.caseLifecycleState,
        recoveryLifecycleState: claims.recoveryLifecycleState,
        createdAt: claims.createdAt,
        companyName: claims.companyName,
        claimAmount: claims.claimAmount,
        currency: claims.currency,
        category: claims.category,
        claimantName: user.name,
        claimantEmail: user.email,
        claimNumber: claims.claimNumber,
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
  });
}

async function fetchUnreadCounts(params: {
  authority: TenantAuthority;
  rows: { id: string }[];
  scope: ClaimsScope;
}) {
  const { authority, rows, scope } = params;
  const { tenantId } = readTenantAuthority(authority);
  const unreadCounts = new Map<string, number>();

  if (scope !== 'member' && rows.length > 0) {
    const unreadRows = await withTenantAuthority(authority, tx =>
      tx
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
        .groupBy(claimMessages.claimId)
    );

    for (const row of unreadRows) {
      unreadCounts.set(row.claimId, Number(row.total || 0));
    }
  }
  return unreadCounts;
}
