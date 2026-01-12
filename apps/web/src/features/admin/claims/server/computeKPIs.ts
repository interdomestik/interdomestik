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
