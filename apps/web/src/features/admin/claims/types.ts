// v2.0.2-admin-claims-ops — Admin Claims Operational Center
import type { ClaimStatus } from '@interdomestik/database/constants';

// Re-export from policy for convenience
export type { WaitingOn } from '@/features/claims/policy';

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
export type ClaimOriginType = 'portal' | 'agent' | 'admin' | 'api';

/**
 * UI-ready operational row for admin claims.
 * Contains all derived fields for display — no raw DB types.
 */
export interface ClaimOperationalRow {
  id: string;
  code: string;
  claimNumber: string | null; // The human readable ID (e.g. CLM-XK-KS01-2026-000123)
  title: string;
  lifecycleStage: LifecycleStage;
  stageStartedAt: Date | null;
  daysInStage: number;
  ownerRole: OwnerRole;
  ownerName: string | null;
  assigneeId: string | null; // Added for KPI "Mine" calculation
  isStuck: boolean;
  hasSlaBreach: boolean;
  isUnassigned: boolean;
  waitingOn: 'member' | 'staff' | 'system' | null;
  hasCashPending: boolean;
  memberId: string;
  memberName: string;
  memberEmail: string;
  branchCode: string | null;
  agentName: string | null;
  originType: ClaimOriginType;
  originRefId: string | null;
  originDisplayName: string | null; // e.g., Agent Name or Integration ID
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2.7: Operational Center Dashboard Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Staff-owned statuses — derived from STATUS_TO_OWNER (single source).
 */
export const STAFF_OWNED_STATUSES = Object.entries(STATUS_TO_OWNER)
  .filter(([, owner]) => owner === 'staff')
  .map(([status]) => status as ClaimStatus);

/**
 * Terminal statuses — canonical source for isTerminal checks.
 */
export const TERMINAL_STATUSES: ClaimStatus[] = ['resolved', 'rejected'];

/**
 * Check if a status is terminal (no further action expected).
 * Canonical helper — import from here, do not duplicate.
 */
export function isTerminalStatus(status: ClaimStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Check if a status is staff-owned.
 * Canonical helper — import from here, do not duplicate.
 */
export function isStaffOwnedStatus(status: ClaimStatus): boolean {
  return STAFF_OWNED_STATUSES.includes(status);
}

/**
 * Pool configuration constants.
 */
export const OPS_POOL_LIMIT = 200;
export const OPS_PAGE_SIZE = 10;

/**
 * Operational KPIs for dashboard header.
 */
export interface OperationalKPIs {
  slaBreach: number;
  unassigned: number;
  stuck: number;
  totalOpen: number;
  waitingOnMember: number;
  assignedToMe: number;
  needsAction: number; // OR-based: sla || unassigned || stuck
}

/**
 * Operational Center response DTO.
 */
export interface OpsCenterResponse {
  kpis: OperationalKPIs;
  prioritized: ClaimOperationalRow[];
  stats: LifecycleStats;
  fetchedAt: string;
  hasMore: boolean; // For load more
}

export type AdminClaimDocument = {
  id: string;
  name: string;
  fileSize: number | null;
  fileType: string | null;
  createdAt: Date | null;
  url: string;
};

/**
 * Detailed operational view for a single claim.
 * Extends the row with full description and documents.
 */
export interface ClaimOpsDetail extends ClaimOperationalRow {
  description: string | null;
  docs: AdminClaimDocument[];
  claimNumber: string | null;
  // Visual fields for detail page
  companyName: string | null;
  claimAmount: string | null;
  currency: string | null;
  createdAt: Date | null;
}

/**
 * Filter parameters for Ops Center.
 */
export interface OpsCenterFilters {
  lifecycle?: LifecycleStage;
  priority?: 'sla' | 'unassigned' | 'stuck' | 'waiting_member' | 'needs_action' | 'mine';
  assignee?: 'all' | 'unassigned' | 'me';
  branch?: string;
  page?: number;
  poolAnchor?: OpsPoolAnchor;
  search?: string;
}

/**
 * Pool anchor for stable pagination across pages.
 * All pool queries must enforce: (updatedAt, id) <= (anchor.updatedAt, anchor.id)
 */
export interface OpsPoolAnchor {
  updatedAt: string; // ISO timestamp
  id: string;
}

/**
 * Pool hash for filter identity (invalidation).
 */
export function computePoolHash(filters: OpsCenterFilters): string {
  const parts = [filters.lifecycle ?? '', filters.branch ?? '', filters.assignee ?? ''];
  return parts.join('|');
}
