import { db } from '@interdomestik/database';
import { branches, claimMessages, claims, user } from '@interdomestik/database/schema';
import {
  aliasedTable,
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  SQL,
} from 'drizzle-orm';

import {
  CLOSED_STATUSES,
  DRAFT_STATUSES,
  IN_PROGRESS_STATUSES,
  type ClaimsListV2Filters,
} from './types';

export function buildClaimsQuery(filters: ClaimsListV2Filters) {
  const { tenantId, role, branchId, userId, search, statusFilter, statuses, assignment } = filters;

  // 1. Base Scoping (Tenant)
  const conditions: SQL[] = [eq(claims.tenantId, tenantId)];

  // 2. Role/Branch Scoping
  // "branch_manager sees only claims for their branch"
  // "staff sees claims assigned to them OR within their branch"
  // "tenant_admin sees all tenant claims"

  if (role === 'branch_manager') {
    if (!branchId) {
      // Should theoretically not happen if role is correct, but safe fallback:
      // If BM has no branch, they see nothing? Or fallback to assigned?
      // Let's assume strict branch scoping.
      conditions.push(sql`1 = 0`); // Impossible condition
    } else {
      conditions.push(eq(claims.branchId, branchId));
    }
  } else if (role === 'staff') {
    // Staff logic: Assigned to me OR (My Branch AND unassigned/assigned) ??
    // Prompt: "staff sees claims assigned to them OR within their branch (depends on existing RBAC)"
    // Let's implement: If branchId exists -> Branch Scoped.
    // Plus always include explicit assignments regardless of branch?
    // "assigned to them OR within their branch" -> (assignedTo == me) OR (branchId == myBranch)
    if (branchId) {
      conditions.push(or(eq(claims.branchId, branchId), eq(claims.staffId, userId))!);
    } else {
      // No branch staff (HQ) -> See assigned to me OR unassigned (triage)
      conditions.push(or(eq(claims.staffId, userId), isNull(claims.staffId))!);
    }
  } else if (['admin', 'tenant_admin', 'super_admin'].includes(role || '')) {
    // No extra filters, sees all in tenant
  } else {
    // Users/Members? Should not be here, but if so, scope to own
    conditions.push(eq(claims.userId, userId));
  }

  // 3. Search Filter
  if (search) {
    /*
      Search should search: claim title + claimant name/email + claim id + branch code.
      We need joins for claimant name/email (user table) and branch code (branches table).
      Drizzle where clause:
     */
    const searchPattern = `%${search}%`;
    conditions.push(
      or(
        ilike(claims.title, searchPattern),
        ilike(claims.id, searchPattern),
        ilike(user.email, searchPattern),
        ilike(user.name, searchPattern),
        ilike(claims.claimNumber, searchPattern),
        ilike(branches.code, searchPattern)
      )!
    );
  }

  // 4. Status Filter
  if (statusFilter) {
    if (statusFilter === 'active') {
      conditions.push(inArray(claims.status, IN_PROGRESS_STATUSES));
    } else if (statusFilter === 'closed') {
      conditions.push(inArray(claims.status, CLOSED_STATUSES));
    } else if (statusFilter === 'draft') {
      conditions.push(inArray(claims.status, DRAFT_STATUSES));
    }
  }

  // 5. Specific Statuses (e.g. Chips)
  if (statuses && statuses.length > 0) {
    conditions.push(inArray(claims.status, statuses));
  }

  // 6. Assignment Filter
  if (assignment === 'assigned') {
    conditions.push(isNotNull(claims.staffId));
  } else if (assignment === 'unassigned') {
    conditions.push(isNull(claims.staffId));
  } else if (assignment === 'me') {
    conditions.push(eq(claims.staffId, userId));
  }

  return {
    where: and(...conditions),
    joinUser: eq(claims.userId, user.id),
    joinBranch: eq(claims.branchId, branches.id),
  };
}

export async function getClaimsListQuery(filters: ClaimsListV2Filters) {
  const { page = 1, perPage = 20 } = filters;
  const offset = (page - 1) * perPage;

  const { where, joinUser, joinBranch } = buildClaimsQuery(filters);
  const staff = aliasedTable(user, 'staff');

  // Main Query
  const dataQuery = db
    .select({
      claim: claims,
      claimant: {
        name: user.name,
        email: user.email,
      },
      staff: {
        name: staff.name,
        email: staff.email,
      },
      branch: {
        id: branches.id,
        name: branches.name,
        code: branches.code,
      },
      assignedAt: claims.assignedAt, // Add assignedAt to the select
      // Unread messages count (optional optimization: separate query/lateral join if slow)
      // For now, let's try a subquery approach if possible or simple separate count?
      // Simpler for now: fetch basic data, assume unreadCount is 0 or handled separately?
      // Legacy 'fetchClaims' had unreadCount.
      // Let's assume we want it.
      // Subquery for count of unread messages:
      unreadCount: sql<number>`(
        SELECT count(*) FROM ${claimMessages} cm
        WHERE cm.claim_id = ${claims.id}
          AND cm.read_at IS NULL
          AND cm.sender_id != ${filters.userId} 
          -- Logic: messages NOT sent by me, and NOT read.
          -- Ideally precise logic involves "who is reading".
          -- If I am admin, I see messages from user.
      )::int`,
    })
    .from(claims)
    .leftJoin(user, joinUser)
    .leftJoin(staff, eq(claims.staffId, staff.id))
    .leftJoin(branches, joinBranch)
    .where(where)
    .orderBy(desc(claims.createdAt), desc(claims.updatedAt)) // Newest first
    .limit(perPage)
    .offset(offset);

  // Facet Counts (Total Active/Draft/Closed) for the Tabs
  // We need to run this *without* the status filter, but *with* scoping & search.
  // So strict scoping applies, search applies, but status does not.
  const facetsFilters = { ...filters, statusFilter: undefined };
  const {
    where: facetsWhere,
    joinUser: fJoinUser,
    joinBranch: fJoinBranch,
  } = buildClaimsQuery(facetsFilters);

  // Single aggregation query for facets
  const facetsQuery = db
    .select({
      active: count(sql`CASE WHEN ${inArray(claims.status, IN_PROGRESS_STATUSES)} THEN 1 END`),
      draft: count(sql`CASE WHEN ${inArray(claims.status, DRAFT_STATUSES)} THEN 1 END`),
      closed: count(sql`CASE WHEN ${inArray(claims.status, CLOSED_STATUSES)} THEN 1 END`),
      total: count(),
    })
    .from(claims)
    .leftJoin(user, fJoinUser)
    .leftJoin(branches, fJoinBranch)
    .where(facetsWhere);

  const [rows, [facets]] = await Promise.all([dataQuery, facetsQuery]);

  return { rows, facets: facets || { active: 0, draft: 0, closed: 0, total: 0 } };
}
