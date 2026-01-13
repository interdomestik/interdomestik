// Phase 2.8: Operational Center Data Loader (Option B: Pool → Sort → Slice)
import { db } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { branches, claims, user } from '@interdomestik/database/schema';
import * as Sentry from '@sentry/nextjs';
import { aliasedTable, and, desc, eq, ilike, inArray, or, sql, SQL } from 'drizzle-orm';

import { isMemberNumberSearch } from '../../members/utils/memberNumber';
import { mapClaimsToOperationalRows, type RawClaimRow } from '../mappers';
import type {
  ClaimOperationalRow,
  LifecycleStage,
  OpsCenterFilters,
  OpsCenterResponse,
} from '../types';
import {
  isStaffOwnedStatus,
  isTerminalStatus,
  OPS_PAGE_SIZE,
  OPS_POOL_LIMIT,
  TERMINAL_STATUSES,
} from '../types';
import type { ClaimsVisibilityContext } from './claimVisibility';
import { getAdminClaimStats } from './getAdminClaimStats';
import { sortByPriority } from './prioritySort';

const LIFECYCLE_STATUS_MAP: Record<LifecycleStage, ClaimStatus[]> = {
  intake: ['draft', 'submitted'],
  verification: ['verification'],
  processing: ['evaluation'],
  negotiation: ['negotiation'],
  legal: ['court'],
  completed: ['resolved', 'rejected'],
};

// Helper uses canonical isTerminalStatus from types

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Filter sorted pool by priority queue filter
// ─────────────────────────────────────────────────────────────────────────────
function filterByPriority(
  rows: ClaimOperationalRow[],
  priority: OpsCenterFilters['priority'],
  userId: string
): ClaimOperationalRow[] {
  if (!priority) return rows;

  switch (priority) {
    case 'sla':
      return rows.filter(r => r.hasSlaBreach);
    case 'unassigned':
      return rows.filter(r => r.isUnassigned && isStaffOwnedStatus(r.status));
    case 'stuck':
      return rows.filter(r => r.isStuck);
    case 'waiting_member':
      return rows.filter(r => r.waitingOn === 'member');
    case 'needs_action':
      return rows.filter(
        r => r.hasSlaBreach || (r.isUnassigned && isStaffOwnedStatus(r.status)) || r.isStuck
      );
    case 'mine':
      // P1 fix: exclude terminal statuses from 'mine' filter
      // Strict Parity with computeKPIs: must be staff-owned
      return rows.filter(
        r => r.assigneeId === userId && isStaffOwnedStatus(r.status) && !isTerminalStatus(r.status)
      );
    default:
      return rows;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DB WHERE conditions for pool fetch
// ─────────────────────────────────────────────────────────────────────────────
function buildPoolConditions(context: ClaimsVisibilityContext, filters: OpsCenterFilters): SQL[] {
  const { tenantId, role, branchId, userId } = context;
  const conditions: SQL[] = [eq(claims.tenantId, tenantId)];

  // Role-based scoping
  if (role === 'branch_manager' && branchId) {
    conditions.push(eq(claims.branchId, branchId));
  } else if (role === 'staff') {
    if (branchId) {
      conditions.push(or(eq(claims.branchId, branchId), eq(claims.staffId, userId))!);
    } else {
      conditions.push(eq(claims.staffId, userId));
    }
  }

  // Exclude terminal statuses (ops = open claims only)
  conditions.push(
    sql`${claims.status} NOT IN (${sql.join(
      TERMINAL_STATUSES.map(s => sql`${s}`),
      sql`, `
    )})`
  );

  // Lifecycle filter (affects KPIs too)
  if (filters.lifecycle) {
    const statuses = LIFECYCLE_STATUS_MAP[filters.lifecycle];
    if (statuses?.length) {
      conditions.push(inArray(claims.status, statuses));
    }
  }

  // Branch filter
  if (filters.branch) {
    conditions.push(eq(branches.code, filters.branch));
  }

  // Pool anchor for stable pagination
  if (filters.poolAnchor) {
    conditions.push(
      sql`(${claims.updatedAt}, ${claims.id}) <= (${filters.poolAnchor.updatedAt}::timestamp, ${filters.poolAnchor.id})`
    );
  }

  // Search filter (Pool Defining)
  // Affects pool fetch and KPIs
  if (filters.search) {
    const term = filters.search.trim().toUpperCase();
    if (term) {
      if (isMemberNumberSearch(term)) {
        // Global Member Number Search (Tenant-Capped)
        // Find users matching the MEM- prefix, then filter claims by those userIds.
        // We use a subquery to keep it efficient and atomic in one query.
        const memberSubquery = db
          .select({ id: user.id })
          .from(user)
          .where(ilike(user.memberNumber, `${term}%`));

        conditions.push(inArray(claims.userId, memberSubquery));
      } else {
        // Standard Claim Search
        conditions.push(
          or(
            eq(claims.claimNumber, term), // Exact match (fastest)
            ilike(claims.claimNumber, `${term}%`), // Prefix match
            ilike(claims.title, `%${term}%`) // Fallback title match
          )!
        );
      }
    }
  }

  return conditions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Filter sorted pool by assignee (In-Memory)
// Phase 2.8: Decoupled from SQL to preserve Global KPIs in sidebar
// ─────────────────────────────────────────────────────────────────────────────
function filterByAssignee(
  rows: ClaimOperationalRow[],
  assigneeFilter: OpsCenterFilters['assignee'],
  userId: string
): ClaimOperationalRow[] {
  if (!assigneeFilter || assigneeFilter === 'all') return rows;

  if (assigneeFilter === 'unassigned') {
    // Strict parity with KPI logic: Unassigned AND Staff-Owned
    return rows.filter(r => r.isUnassigned && isStaffOwnedStatus(r.status));
  } else if (assigneeFilter === 'me') {
    // Strict parity with Workload Count: Match 'meSummary' logic
    return rows.filter(r => r.assigneeId === userId && isStaffOwnedStatus(r.status));
  } else if (assigneeFilter.startsWith('staff:')) {
    const staffId = assigneeFilter.split(':')[1];
    if (staffId) {
      // Strict parity with Workload Count: Staff-ID AND Staff-Owned
      return rows.filter(r => r.assigneeId === staffId && isStaffOwnedStatus(r.status));
    }
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
import { computeAssigneeOverview, computeKPIsFromPool } from './computeKPIs';

// ─────────────────────────────────────────────────────────────────────────────
// Main Loader: getOpsCenterData
// ─────────────────────────────────────────────────────────────────────────────
export async function getOpsCenterData(
  context: ClaimsVisibilityContext,
  filters: OpsCenterFilters = {}
): Promise<OpsCenterResponse> {
  const page = filters.page ?? 0;

  try {
    const conditions = buildPoolConditions(context, filters);
    const staff = aliasedTable(user, 'staff');
    const agent = aliasedTable(user, 'agent'); // Added agent alias

    // Step 1: Fetch bounded pool (DB ordering by updatedAt for stability)
    // Fetch LIMIT + 1 to detect if there are more items in the DB
    const rawRows = await db
      .select({
        claim: {
          id: claims.id,
          title: claims.title,
          status: claims.status,
          createdAt: claims.createdAt,
          updatedAt: claims.updatedAt,
          assignedAt: claims.assignedAt,
          userId: claims.userId, // Added for linking
          claimNumber: claims.claimNumber,
          staffId: claims.staffId, // Critical: needed for isUnassigned computation
          category: claims.category,
          currency: claims.currency,
          statusUpdatedAt: claims.statusUpdatedAt,
          origin: claims.origin,
          originRefId: claims.originRefId,
        },
        claimant: {
          name: user.name,
          email: user.email,
          memberNumber: user.memberNumber,
        },
        staff: {
          name: staff.name,
          email: staff.email,
        },
        branch: {
          id: branches.id,
          code: branches.code,
          name: branches.name,
        },
        agent: {
          name: agent.name,
        },
      })
      .from(claims)
      .leftJoin(user, eq(claims.userId, user.id))
      .leftJoin(staff, eq(claims.staffId, staff.id))
      .leftJoin(branches, eq(claims.branchId, branches.id))
      .leftJoin(agent, eq(claims.agentId, agent.id)) // Join on agentId (indexed)
      .where(and(...conditions))
      .orderBy(desc(claims.updatedAt), desc(claims.id))
      .limit(OPS_POOL_LIMIT + 1);

    // Determine if pool logic was curtailed by limit
    const poolMayHaveMore = rawRows.length > OPS_POOL_LIMIT;
    const effectiveRows = poolMayHaveMore ? rawRows.slice(0, OPS_POOL_LIMIT) : rawRows;

    // Step 2: Map to operational rows (computes risk flags)
    const pool = mapClaimsToOperationalRows(effectiveRows as RawClaimRow[]);

    // Step 3: Compute KPIs from pool (global, before priority filter)
    const kpis = computeKPIsFromPool(pool, context.userId);

    // Step 4: Sort by priority score (server-side canonical)
    const sortedPool = sortByPriority(pool);

    // Step 5: Filter by Assignee (In-Memory, strictly for List View)
    // Global Stats (kpis, assignees summary) use 'sortedPool' (unfiltered)
    // List uses 'sortedAssigneePool'
    const sortedAssigneePool = filterByAssignee(sortedPool, filters.assignee, context.userId);

    // Step 6: Filter by priority (queue filter, list only)
    const sortedFilteredPool = filterByPriority(
      sortedAssigneePool,
      filters.priority,
      context.userId
    );

    // Step 6: Slice for current page
    const startIdx = page * OPS_PAGE_SIZE;
    const prioritized = sortedFilteredPool.slice(startIdx, startIdx + OPS_PAGE_SIZE);

    // Step 7: Compute Assignee Overview (Phase 2.8)
    // Uses the full sorted pool (before priority filtering/slicing) to give global context
    const { assignees, unassignedSummary, meSummary } = computeAssigneeOverview(
      sortedPool,
      context.userId
    );

    // Step 8: Compute hasMore
    // Phase 2.8 Fix: Handle In-Memory filters (Assignee) preventing "Ghost Load"
    // If filtering by assignee, we treat the current Global Pool as the definitive source.
    // relying on 'poolMayHaveMore' would cause infinite "Load More" clicks that return empty results
    // if the next DB page contains no claims for this assignee.
    const isInMemoryFilterActive = !!filters.assignee && filters.assignee !== 'all';

    const hasMore = isInMemoryFilterActive
      ? (page + 1) * OPS_PAGE_SIZE < sortedFilteredPool.length
      : (page + 1) * OPS_PAGE_SIZE < sortedFilteredPool.length || poolMayHaveMore;

    // Get lifecycle stats
    const stats = await getAdminClaimStats(context);

    return {
      kpis,
      prioritized,
      stats,
      assignees,
      unassignedSummary,
      meSummary,
      fetchedAt: new Date().toISOString(),
      hasMore,
    };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { tenantId: context.tenantId, action: 'getOpsCenterData', filters },
    });
    return {
      kpis: {
        slaBreach: 0,
        unassigned: 0,
        stuck: 0,
        totalOpen: 0,
        waitingOnMember: 0,
        assignedToMe: 0,
        needsAction: 0,
      },
      prioritized: [],
      stats: { intake: 0, verification: 0, processing: 0, negotiation: 0, legal: 0, completed: 0 },
      assignees: [],
      unassignedSummary: { countOpen: 0, countNeedsAction: 0 },
      meSummary: { countOpen: 0, countNeedsAction: 0 },
      fetchedAt: new Date().toISOString(),
      hasMore: false,
    };
  }
}
