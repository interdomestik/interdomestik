// v2.0.2-admin-claims-ops — Admin Claims Operational Center
import type { ClaimStatus } from '@interdomestik/database/constants';

/**
 * Lifecycle stages for operational admin view.
 * Maps to business lifecycle semantics, not raw statuses.
 */
export type LifecycleStage =
  | 'intake'
  | 'verification'
  | 'processing'
  | 'negotiation'
  | 'legal'
  | 'completed';

export type OwnerRole = 'staff' | 'agent' | 'member' | 'system';

/**
 * UI-ready operational row for admin claims.
 * Contains all derived fields for display — no raw DB types.
 */
export interface ClaimOperationalRow {
  id: string;
  code: string;
  title: string;
  lifecycleStage: LifecycleStage;
  stageStartedAt: Date | null;
  daysInStage: number;
  ownerRole: OwnerRole;
  ownerName: string | null;
  isStuck: boolean;
  hasSlaBreach: boolean;
  hasCashPending: boolean;
  memberName: string;
  memberEmail: string;
  branchCode: string | null;
  agentName: string | null;
  category: string | null;
  status: ClaimStatus;
}

/**
 * Lifecycle tab stats for badge counts.
 */
export interface LifecycleStats {
  intake: number;
  verification: number;
  processing: number;
  negotiation: number;
  legal: number;
  completed: number;
}

/**
 * Admin Claims V2 response DTO.
 */
export interface AdminClaimsV2Response {
  rows: ClaimOperationalRow[];
  stats: LifecycleStats;
  pagination: {
    page: number;
    perPage: number;
    totalCount: number;
    totalPages: number;
  };
}

/**
 * Filter parameters for V2 admin claims list.
 */
export interface AdminClaimsV2Filters {
  lifecycleStage?: LifecycleStage;
  page?: number;
  perPage?: number;
  search?: string;
}

/**
 * Status to lifecycle stage mapping.
 */
export const STATUS_TO_LIFECYCLE: Record<ClaimStatus, LifecycleStage> = {
  draft: 'intake',
  submitted: 'intake',
  verification: 'verification',
  evaluation: 'processing',
  negotiation: 'negotiation',
  court: 'legal',
  resolved: 'completed',
  rejected: 'completed',
};

/**
 * Status to owner role mapping (who needs to act next).
 */
export const STATUS_TO_OWNER: Record<ClaimStatus, OwnerRole> = {
  draft: 'member',
  submitted: 'staff',
  verification: 'member',
  evaluation: 'staff',
  negotiation: 'staff',
  court: 'staff',
  resolved: 'system',
  rejected: 'system',
};

/**
 * Days threshold before claim is considered stuck.
 */
export const STUCK_THRESHOLDS: Partial<Record<ClaimStatus, number>> = {
  submitted: 3,
  verification: 3,
  evaluation: 5,
  negotiation: 7,
  court: 10,
  draft: 7,
};
