import type { CrmPipelineSnapshotRecord } from '@interdomestik/domain-crm/reporting/repository';
import { type AdminCrmSnapshotFreshness } from './_core';
import type { BranchManagerCrmSnapshotRow } from './_branch-manager-core';

export const BRANCH_MANAGER_CRM_SNAPSHOT_DELAYED_AFTER_HOURS = 24;

export const BRANCH_MANAGER_CRM_SNAPSHOT_STALE_AFTER_HOURS = 48;

export function deriveBranchManagerCrmSnapshotFreshness(
  snapshotDate: string | null,
  nowIso: string
): AdminCrmSnapshotFreshness {
  if (!snapshotDate) return 'missing';
  const [year, month, day] = snapshotDate.split('-').map(Number);
  if (!year || !month || !day) return 'stale';
  const snapshotEnd = Date.UTC(year, month - 1, day + 1) - 1;
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return 'stale';
  const ageHours = (now - snapshotEnd) / (60 * 60 * 1000);
  if (ageHours < BRANCH_MANAGER_CRM_SNAPSHOT_DELAYED_AFTER_HOURS) return 'fresh';
  if (ageHours < BRANCH_MANAGER_CRM_SNAPSHOT_STALE_AFTER_HOURS) return 'delayed';
  return 'stale';
}

export function pipelineLabel(pipelineId: string): string {
  return pipelineId;
}

export function mapSnapshotRows(
  rows: readonly CrmPipelineSnapshotRecord[],
  args: { branchId: string; branchLabel: string; nowIso: string }
): BranchManagerCrmSnapshotRow[] {
  return rows
    .filter(row => row.branchId === args.branchId)
    .map(row => ({
      branchId: args.branchId,
      branchLabel: args.branchLabel,
      closedLostAmountMinor: row.closedLostAmountMinor,
      closedWonAmountMinor: row.closedWonAmountMinor,
      currencyCode: row.currencyCode,
      freshness: deriveBranchManagerCrmSnapshotFreshness(row.snapshotDate, args.nowIso),
      openDealCount: row.openDealCount,
      pipelineId: row.pipelineId,
      pipelineLabel: pipelineLabel(row.pipelineId),
      snapshotDate: row.snapshotDate,
      snapshotVersion: row.snapshotVersion,
      totalPipelineAmountMinor: row.rawValueAmountMinor,
      weightedPipelineAmountMinor: row.weightedValueAmountMinor,
    }))
    .sort((left, right) => {
      const byCurrency = left.currencyCode.localeCompare(right.currencyCode);
      if (byCurrency !== 0) return byCurrency;
      return left.pipelineLabel.localeCompare(right.pipelineLabel);
    });
}
