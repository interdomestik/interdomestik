// v2.0.0-ops — Admin Claims lifecycle hardening
import type { ClaimStatus } from '@interdomestik/database/constants';
import type {
  ClaimLifecycleStage,
  ClaimOwnerRole,
  ClaimsListV2Dto,
  ClaimsListV2Row,
} from './types';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const STATUS_STAGE_MAP: Record<ClaimStatus, ClaimLifecycleStage> = {
  draft: 'draft',
  submitted: 'submitted',
  verification: 'verification',
  evaluation: 'evaluation',
  negotiation: 'negotiation',
  court: 'court',
  resolved: 'resolved',
  rejected: 'rejected',
};

const STATUS_OWNER_ROLE_MAP: Record<ClaimStatus, ClaimOwnerRole> = {
  draft: 'member',
  submitted: 'staff',
  verification: 'member',
  evaluation: 'staff',
  negotiation: 'staff',
  court: 'staff',
  resolved: 'system',
  rejected: 'system',
};

const STUCK_THRESHOLDS: Partial<Record<ClaimStatus, number>> = {
  submitted: 3,
  verification: 3,
  evaluation: 5,
  negotiation: 7,
  court: 10,
  draft: 7,
};

function normalizeDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveStage(status: ClaimStatus): ClaimLifecycleStage {
  return STATUS_STAGE_MAP[status] ?? 'unknown';
}

function resolveOwnerRole(status: ClaimStatus): ClaimOwnerRole {
  return STATUS_OWNER_ROLE_MAP[status] ?? 'unknown';
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

export function mapClaimsToDto(
  rows: any[],
  facets: { active: number; draft: number; closed: number; total: number },
  page: number,
  perPage: number
): ClaimsListV2Dto {
  const mappedRows: ClaimsListV2Row[] = rows.map(row => {
    const { claim, claimant, branch, staff, unreadCount } = row;

    // Status Label Mapping
    // "no ghost statuses" - we rely on the enum.
    // UI will translate `claims.status.${status}`
    const status = claim.status as ClaimStatus;
    const statusLabelKey = `claims.status.${status}`;

    // Format Amount
    // "no '-' if amount exists; show blank only if truly null"
    // Drizzle decimal returns string usually.
    let formattedAmount = null;
    if (claim.claimAmount !== null && claim.claimAmount !== undefined) {
      // We do not format with currency symbol here, just raw formatted number string?
      // Prompt says: "amountCents | amount (use whichever app uses)"
      // "formatted (no - if exists)"
      // Let's pass the raw string from DB (it's decimal, so "500.00")
      formattedAmount = claim.claimAmount;
    }

    const stageStart = normalizeDate(claim.updatedAt ?? claim.assignedAt ?? claim.createdAt);
    const daysInCurrentStage = getDaysInStage(stageStart);
    const currentStage = resolveStage(status);
    const currentOwnerRole = resolveOwnerRole(status);
    const isStuck = isStageStuck(status, daysInCurrentStage);

    return {
      id: claim.id,
      claimNumber: claim.claimNumber,
      title: claim.title,
      status: status,
      statusLabelKey: statusLabelKey,
      currentStage,
      currentOwnerRole,
      isStuck,
      daysInCurrentStage,
      claimantName: claimant?.name || 'Unknown',
      claimantEmail: claimant?.email || '',
      branchId: branch?.id || null,
      branchCode: branch?.code || null,
      branchName: branch?.name || null,
      staffName: staff?.name || null,
      staffEmail: staff?.email || null,
      assignedAt: claim.assignedAt || null,
      amount: formattedAmount,
      currency: claim.currency || 'EUR',
      createdAt: claim.createdAt,
      updatedAt: claim.updatedAt,
      unreadCount: unreadCount || 0,
      category: claim.category,
    };
  });

  // Note: If search is active, 'total' from facetsQuery is the filtered total.
  // facets.total is derived from the query that included search.

  return {
    rows: mappedRows,
    totals: {
      active: Number(facets.active || 0),
      draft: Number(facets.draft || 0),
      closed: Number(facets.closed || 0),
    },
    pagination: {
      page,
      perPage,
      totalCount: Number(facets.total || 0), // This is the total matching search/scope
      totalPages: Math.ceil(Number(facets.total || 0) / perPage),
    },
  };
}
