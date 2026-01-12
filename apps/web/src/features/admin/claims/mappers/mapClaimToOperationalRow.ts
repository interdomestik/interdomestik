// v2.0.2-admin-claims-ops — Pure mapper for operational rows
import type { ClaimStatus } from '@interdomestik/database/constants';

import { computeRiskFlags } from '@/features/claims/policy';
import type { ClaimOperationalRow, ClaimOriginType, LifecycleStage, OwnerRole } from '../types';
import { STATUS_TO_LIFECYCLE, STATUS_TO_OWNER } from '../types';

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

export interface RawClaimRow {
  claim: {
    id: string;
    title: string;
    status: ClaimStatus;
    createdAt: Date | null;
    updatedAt: Date | null;
    assignedAt: Date | null;
    staffId: string | null;
    category: string | null;
    currency: string | null;
    statusUpdatedAt: Date | null;
    origin: string | null;
    originRefId: string | null;
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
  agent?: {
    name: string | null;
  } | null;
}

/**
 * Maps raw DB row to operational row DTO.
 * Pure function — no JSX, no translations, no formatting.
 * Uses policy module for all risk computations.
 */
export function mapClaimToOperationalRow(row: RawClaimRow): ClaimOperationalRow {
  const { claim, claimant, staff, branch, agent } = row;
  const status = claim.status as ClaimStatus;

  // Derive timing
  // Use statusUpdatedAt if available for accurate "time in stage", fallback to other dates
  const stageStartedAt = normalizeDate(
    claim.statusUpdatedAt ?? claim.updatedAt ?? claim.assignedAt ?? claim.createdAt
  );
  const daysInStage = getDaysInStage(stageStartedAt);

  // Derive lifecycle semantics
  const lifecycleStage: LifecycleStage = STATUS_TO_LIFECYCLE[status] ?? 'intake';
  const ownerRole: OwnerRole = STATUS_TO_OWNER[status] ?? 'system';

  // Compute risk flags using policy module
  const riskFlags = computeRiskFlags(status, daysInStage, claim.staffId ?? null);

  return {
    id: claim.id,
    code: claim.id.slice(0, 8).toUpperCase(),
    title: claim.title,
    lifecycleStage,
    stageStartedAt,
    daysInStage,
    ownerRole,
    ownerName: staff?.name ?? null,
    assigneeId: claim.staffId ?? null,
    isStuck: riskFlags.isStuck,
    hasSlaBreach: riskFlags.hasSlaBreach,
    isUnassigned: riskFlags.isUnassigned,
    waitingOn: riskFlags.waitingOn,
    hasCashPending: false, // Placeholder — no existing logic for this
    memberName: claimant?.name ?? 'Unknown',
    memberEmail: claimant?.email ?? '',
    branchCode: branch?.code ?? null,
    agentName: agent?.name ?? null,
    originType: (claim.origin as ClaimOriginType) ?? 'portal',
    originRefId: claim.originRefId ?? null,
    originDisplayName: agent?.name ?? null, // Default display for agent origin
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
