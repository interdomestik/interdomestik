/**
 * Claims SLA Policy Module
 * v2.1 — Phase 2 Risk Indicators
 *
 * This module defines all operational thresholds and risk computation.
 * Contains NO UI logic. Pure business rules only.
 */

import type { ClaimStatus } from '@interdomestik/database/constants';

// ============================================================================
// TYPES
// ============================================================================

export type WaitingOn = 'member' | 'staff' | 'system' | null;

export interface RiskFlags {
  isStuck: boolean;
  hasSlaBreach: boolean;
  isUnassigned: boolean;
  waitingOn: WaitingOn;
}

export interface StageThreshold {
  /** Days before marking as "needs attention" */
  stuckThreshold: number;
  /** Days before SLA breach (0 = no SLA) */
  slaThreshold: number;
  /** Whether staff assignment is required */
  requiresStaff: boolean;
}

// ============================================================================
// STAGE THRESHOLDS (Configurable per-stage)
// ============================================================================

/**
 * Default thresholds per claim status.
 * These can be overridden per-tenant in future phases.
 */
export const STAGE_THRESHOLDS: Record<ClaimStatus, StageThreshold> = {
  draft: {
    stuckThreshold: 7,
    slaThreshold: 0, // No SLA for drafts
    requiresStaff: false,
  },
  submitted: {
    stuckThreshold: 2,
    slaThreshold: 3,
    requiresStaff: true,
  },
  verification: {
    stuckThreshold: 5,
    slaThreshold: 7,
    requiresStaff: true,
  },
  evaluation: {
    stuckThreshold: 3,
    slaThreshold: 5,
    requiresStaff: true,
  },
  negotiation: {
    stuckThreshold: 7,
    slaThreshold: 14,
    requiresStaff: true,
  },
  court: {
    stuckThreshold: 30,
    slaThreshold: 0, // Court has no SLA (external dependency)
    requiresStaff: true,
  },
  resolved: {
    stuckThreshold: 0,
    slaThreshold: 0,
    requiresStaff: false,
  },
  rejected: {
    stuckThreshold: 0,
    slaThreshold: 0,
    requiresStaff: false,
  },
};

// ============================================================================
// OWNER DERIVATION
// ============================================================================

/**
 * Derive who is currently responsible for action.
 * This is the "owner" role — who must act next.
 */
export const STATUS_TO_WAITING_ON: Record<ClaimStatus, WaitingOn> = {
  draft: 'member',
  submitted: 'staff',
  verification: 'member',
  evaluation: 'staff',
  negotiation: 'staff',
  court: 'staff',
  resolved: null,
  rejected: null,
};

// ============================================================================
// RISK COMPUTATION
// ============================================================================

/**
 * Compute all risk flags for a claim.
 *
 * @param status - Current claim status
 * @param daysInStage - Days since last status change
 * @param staffId - Assigned staff ID (null if unassigned)
 */
export function computeRiskFlags(
  status: ClaimStatus,
  daysInStage: number,
  staffId: string | null
): RiskFlags {
  const thresholds = STAGE_THRESHOLDS[status];
  const waitingOn = STATUS_TO_WAITING_ON[status];

  const isStuck = thresholds.stuckThreshold > 0 && daysInStage > thresholds.stuckThreshold;

  const hasSlaBreach = thresholds.slaThreshold > 0 && daysInStage > thresholds.slaThreshold;

  const isUnassigned = thresholds.requiresStaff && !staffId;

  return {
    isStuck,
    hasSlaBreach,
    isUnassigned,
    waitingOn,
  };
}

/**
 * Get the stuck threshold for a given status.
 * Used for display purposes.
 */
export function getStuckThreshold(status: ClaimStatus): number {
  return STAGE_THRESHOLDS[status].stuckThreshold;
}

/**
 * Get the SLA threshold for a given status.
 * Returns 0 if no SLA is configured.
 */
export function getSlaThreshold(status: ClaimStatus): number {
  return STAGE_THRESHOLDS[status].slaThreshold;
}

/**
 * Check if a status is terminal (no further action expected).
 * @deprecated Use isTerminalStatus from features/admin/claims/types.ts for consistency.
 * Kept here for backwards compatibility with existing imports.
 */
export function isTerminalStatus(status: ClaimStatus): boolean {
  return status === 'resolved' || status === 'rejected';
}
