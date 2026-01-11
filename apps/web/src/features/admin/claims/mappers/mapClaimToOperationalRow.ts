// v2.0.2-admin-claims-ops — Pure mapper for operational rows
import type { ClaimStatus } from '@interdomestik/database/constants';
import type { ClaimOperationalRow, LifecycleStage, OwnerRole } from '../types';
import { STATUS_TO_LIFECYCLE, STATUS_TO_OWNER, STUCK_THRESHOLDS } from '../types';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function normalizeDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDaysInStage(stageStart: Date | null): number {
  if (!stageStart) return 0;
  const diff = Date.now() - stageStart.getTime();
  return Math.max(0, Math.floor(diff / MS_PER_DAY));
}

function isStageStuck(status: ClaimStatus, daysInStage: number): boolean {
  const threshold = STUCK_THRESHOLDS[status];
  if (threshold === undefined) return false;
  return daysInStage >= threshold;
}

export interface RawClaimRow {
  claim: {
    id: string;
    title: string;
    status: ClaimStatus;
    createdAt: Date | null;
    updatedAt: Date | null;
    assignedAt: Date | null;
    category: string | null;
    currency: string | null;
  };
  claimant: {
    name: string | null;
    email: string | null;
  } | null;
  staff: {
    name: string | null;
    email: string | null;
  } | null;
  branch: {
    id: string | null;
    code: string | null;
    name: string | null;
  } | null;
}

/**
 * Maps raw DB row to operational row DTO.
 * Pure function — no JSX, no translations, no formatting.
 */
export function mapClaimToOperationalRow(row: RawClaimRow): ClaimOperationalRow {
  const { claim, claimant, staff, branch } = row;
  const status = claim.status as ClaimStatus;

  const stageStartedAt = normalizeDate(claim.updatedAt ?? claim.assignedAt ?? claim.createdAt);
  const daysInStage = getDaysInStage(stageStartedAt);

  const lifecycleStage: LifecycleStage = STATUS_TO_LIFECYCLE[status] ?? 'intake';
  const ownerRole: OwnerRole = STATUS_TO_OWNER[status] ?? 'system';
  const isStuck = isStageStuck(status, daysInStage);

  return {
    id: claim.id,
    code: claim.id.slice(0, 8).toUpperCase(),
    title: claim.title,
    lifecycleStage,
    stageStartedAt,
    daysInStage,
    ownerRole,
    ownerName: staff?.name ?? null,
    isStuck,
    hasSlaBreach: isStuck, // Reuse stuck logic for SLA (can be refined)
    hasCashPending: false, // Placeholder — no existing logic for this
    memberName: claimant?.name ?? 'Unknown',
    memberEmail: claimant?.email ?? '',
    branchCode: branch?.code ?? null,
    agentName: null, // Placeholder — add agent join if needed
    category: claim.category,
    status,
  };
}

/**
 * Maps array of raw rows to operational rows.
 */
export function mapClaimsToOperationalRows(rows: RawClaimRow[]): ClaimOperationalRow[] {
  return rows.map(mapClaimToOperationalRow);
}
