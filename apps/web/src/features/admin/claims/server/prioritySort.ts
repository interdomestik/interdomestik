// Phase 2.7: Priority Sort Helper (Canonical Server Implementation)
import type { ClaimOperationalRow } from '../types';
import { isStaffOwnedStatus } from '../types';

/**
 * Computes priority score for a claim.
 *
 * Priority levels:
 * 1. SLA breach: +1000
 * 2. Unassigned + staff-owned: +500
 * 3. Stuck: +250
 * 4. Days in stage: +0-100
 */
export function computePriorityScore(row: ClaimOperationalRow): number {
  let score = 0;

  // Level 1: SLA breach (highest)
  if (row.hasSlaBreach) score += 1000;

  // Level 2: Unassigned staff-owned
  if (row.isUnassigned && isStaffOwnedStatus(row.status)) score += 500;

  // Level 3: Stuck
  if (row.isStuck) score += 250;

  // Level 4: Days in stage (capped at 100)
  score += Math.min(row.daysInStage, 100);

  return score;
}

/**
 * Sorts claims by priority score (descending).
 */
export function sortByPriority(rows: ClaimOperationalRow[]): ClaimOperationalRow[] {
  return [...rows].sort((a, b) => computePriorityScore(b) - computePriorityScore(a));
}
