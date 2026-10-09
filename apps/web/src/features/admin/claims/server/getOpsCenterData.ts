// Phase 2.8: Operational Center Data Loader (Option B: Pool → Sort → Slice)
import * as Sentry from '@sentry/nextjs';

import { mapClaimsToOperationalRows } from '../mappers';
import type { ClaimOperationalRow, OpsCenterFilters, OpsCenterResponse } from '../types';
import { isStaffOwnedStatus, isTerminalStatus, OPS_PAGE_SIZE, OPS_POOL_LIMIT } from '../types';
import { canViewAdminClaims, type ClaimsVisibilityContext } from './claimVisibility';
import { computeAssigneeOverview, computeKPIsFromPool } from './computeKPIs';
import { getAdminClaimStats } from './getAdminClaimStats';
import { loadOpsCenterPool } from './loadOpsCenterPool';
import { sortByPriority } from './prioritySort';

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

function emptyOpsCenterResponse(): OpsCenterResponse {
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

// ─────────────────────────────────────────────────────────────────────────────
// Main Loader: getOpsCenterData
// ─────────────────────────────────────────────────────────────────────────────
export async function getOpsCenterData(
  context: ClaimsVisibilityContext,
  filters: OpsCenterFilters = {}
): Promise<OpsCenterResponse> {
  // Resource admission before any transaction; no ops scope means no reads.
  if (!canViewAdminClaims(context)) {
    return emptyOpsCenterResponse();
  }

  const page = filters.page ?? 0;

  try {
    // Step 1: Fetch the complete bounded pool. The access-tenant pool transaction and any
    // home-tenant reads derived from admitted claims run sequentially, each released before
    // the next opens. Stats are read only afterwards: getAdminClaimStats opens its own tenant
    // transaction, so nesting it would need a second connection and can deadlock a max-1 pool.
    const rawRows = await loadOpsCenterPool(context, filters);

    // Step 1b: Lifecycle stats, sequentially after the pool transactions are released.
    // getAdminClaimStats reports and absorbs a stats-only failure (zero stats), so a
    // valid pool and KPIs are preserved.
    const stats = await getAdminClaimStats(context);

    // Determine if pool logic was curtailed by limit
    const poolMayHaveMore = rawRows.length > OPS_POOL_LIMIT;
    const effectiveRows = poolMayHaveMore ? rawRows.slice(0, OPS_POOL_LIMIT) : rawRows;

    // Step 2: Map to operational rows (computes risk flags)
    const pool = mapClaimsToOperationalRows(effectiveRows);

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
    return emptyOpsCenterResponse();
  }
}
