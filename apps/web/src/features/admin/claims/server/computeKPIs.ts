// Phase 3: High-value unit testing helper
// Extracted from getOpsCenterData.ts to enable verifying KPI logic

import type { ClaimOperationalRow, OperationalKPIs } from '../types';
import { isStaffOwnedStatus, isTerminalStatus } from '../types';

/**
 * Computes global KPIs from the full (or adequately large) pool of claims.
 * - Enforces "mine" filter logic (assignedToMe) avoids terminal status
 * - Enforces "needs action" is a superset OR of risk flags
 * - Ensures no double-counting in needs action
 */
export function computeKPIsFromPool(rows: ClaimOperationalRow[], userId: string): OperationalKPIs {
  let slaBreach = 0;
  let unassigned = 0;
  let stuck = 0;
  let waitingOnMember = 0;
  let assignedToMe = 0;
  const needsActionSet = new Set<string>();

  for (const row of rows) {
    if (row.hasSlaBreach) {
      slaBreach++;
      needsActionSet.add(row.id);
    }
    if (row.isUnassigned && isStaffOwnedStatus(row.status)) {
      unassigned++;
      needsActionSet.add(row.id);
    }
    if (row.isStuck) {
      stuck++;
      needsActionSet.add(row.id);
    }
    if (row.waitingOn === 'member' && !isTerminalStatus(row.status)) {
      waitingOnMember++;
    }
    // assignedToMe: must match 'mine' filter predicate exactly
    if (
      row.assigneeId === userId &&
      isStaffOwnedStatus(row.status) &&
      !isTerminalStatus(row.status)
    ) {
      assignedToMe++;
    }
  }

  return {
    slaBreach,
    unassigned,
    stuck,
    totalOpen: rows.length,
    waitingOnMember,
    assignedToMe,
    needsAction: needsActionSet.size, // OR-based, no double count
  };
}

/**
 * Phase 2.8: Detailed Assignee Workload Overview
 * buckets: Me, Unassigned, Staff List (Top N)
 */
export function computeAssigneeOverview(
  rows: ClaimOperationalRow[],
  currentUserId: string
): {
  assignees: import('../types').AssigneeSummary[];
  unassignedSummary: { countOpen: number; countNeedsAction: number };
  meSummary: { countOpen: number; countNeedsAction: number };
} {
  const meSummary = { countOpen: 0, countNeedsAction: 0 };
  const unassignedSummary = { countOpen: 0, countNeedsAction: 0 };
  const staffMap = new Map<string, import('../types').AssigneeSummary>();

  for (const row of rows) {
    if (isTerminalStatus(row.status)) continue;

    const isStaffOwned = isStaffOwnedStatus(row.status);
    const needsAction =
      row.hasSlaBreach || row.isStuck || (row.isUnassigned && isStaffOwnedStatus(row.status));

    // Bucket 1: Unassigned (use policy flag row.isUnassigned)
    if (row.isUnassigned && isStaffOwned) {
      unassignedSummary.countOpen++;
      if (needsAction) unassignedSummary.countNeedsAction++;
    }

    // Bucket 2: Me (Current User)
    if (row.assigneeId === currentUserId && isStaffOwned) {
      meSummary.countOpen++;
      if (needsAction) meSummary.countNeedsAction++;
    }

    // Bucket 3: Staff Map (Any assigned row)
    if (row.assigneeId) {
      if (!staffMap.has(row.assigneeId)) {
        staffMap.set(row.assigneeId, {
          staffId: row.assigneeId,
          name: row.ownerName || null,
          email: null, // Will be populated if available in row context or join
          countOpen: 0,
          countNeedsAction: 0,
        });
      }

      const staffStats = staffMap.get(row.assigneeId)!;

      // Update basic info if missing (e.g. name fallback)
      if (!staffStats.name && row.ownerName) staffStats.name = row.ownerName;

      // Workload Count: Must be Staff-Owned to count as "Workload"
      if (isStaffOwned) {
        staffStats.countOpen++;
        if (needsAction) staffStats.countNeedsAction++;
      }
    }
  }

  // Convert map to list and sort
  const assignees = Array.from(staffMap.values())
    .filter(a => a.countOpen > 0 || a.countNeedsAction > 0)
    .sort((a, b) => {
      // 1. Open Count Desc
      if (b.countOpen !== a.countOpen) return b.countOpen - a.countOpen;
      // 2. Needs Action Desc
      if (b.countNeedsAction !== a.countNeedsAction) return b.countNeedsAction - a.countNeedsAction;
      // 3. Name Asc
      const nameA = a.name || '';
      const nameB = b.name || '';
      const nameCompare = nameA.localeCompare(nameB);
      if (nameCompare !== 0) return nameCompare;
      // 4. Staff ID Asc (Tie Breaker)
      return a.staffId.localeCompare(b.staffId);
    })
    .slice(0, 10);

  return { meSummary, unassignedSummary, assignees };
}
