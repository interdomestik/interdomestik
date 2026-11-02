import {
  type CrmWeightedPipelineGroup,
  type CrmWeightedPipelineRow,
} from '@interdomestik/domain-crm/reporting';
import type { StaffCrmPipelineWorkloadRow, StaffCrmReportingCoreOptions } from './_core';

export const STAFF_CRM_PIPELINE_MAX_ROWS = 10;

export function isExcludedWeightedRow(row: CrmWeightedPipelineRow): boolean {
  if (row.archivedAt) return true;
  if (!row.pipelineId || !row.currentStageId || !row.currencyCode) return true;
  if (row.valueAmountMinor == null) return true;
  return row.forecastCategory === 'closed' && !(row.isWonStage || row.isLostStage);
}

export function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

export function addStaffWeightedPipelineValue(
  group: CrmWeightedPipelineGroup,
  row: CrmWeightedPipelineRow
) {
  const value = row.valueAmountMinor ?? 0;
  const weighted = roundHalfAwayFromZero((value * (row.stageProbability ?? 0)) / 100);

  if (row.isWonStage) {
    group.closedWonAmountMinor += value;
    return;
  }
  if (row.isLostStage) {
    group.closedLostAmountMinor += value;
    return;
  }

  group.openDealCount += 1;
  group.rawValueAmountMinor += value;
  group.weightedValueAmountMinor += weighted;
  if (row.forecastCategory === 'best') group.forecastBestAmountMinor += weighted;
  else if (row.forecastCategory === 'commit') group.forecastCommitAmountMinor += weighted;
  else if (row.forecastCategory === 'omitted') group.forecastOmittedAmountMinor += weighted;
  else group.forecastPipelineAmountMinor += weighted;
}

export function createStaffWeightedPipelineGroup(
  row: CrmWeightedPipelineRow
): CrmWeightedPipelineGroup {
  return {
    agentId: null,
    branchId: row.branchId ?? null,
    closedLostAmountMinor: 0,
    closedWonAmountMinor: 0,
    currencyCode: row.currencyCode!,
    forecastBestAmountMinor: 0,
    forecastCommitAmountMinor: 0,
    forecastOmittedAmountMinor: 0,
    forecastPipelineAmountMinor: 0,
    openDealCount: 0,
    pipelineId: row.pipelineId!,
    rawValueAmountMinor: 0,
    stageId: null,
    tenantId: row.tenantId,
    weightedValueAmountMinor: 0,
  };
}

export function aggregateStaffPipelineWorkloadRows(
  rows: readonly CrmWeightedPipelineRow[],
  labels: Required<StaffCrmReportingCoreOptions>['labels'],
  excludedInconsistentForecastCount: number
): StaffCrmPipelineWorkloadRow[] {
  const groups = new Map<string, CrmWeightedPipelineGroup>();

  for (const row of rows) {
    if (isExcludedWeightedRow(row)) continue;
    const key = [row.tenantId, row.branchId ?? '', row.pipelineId, row.currencyCode].join('\u001f');
    const group = groups.get(key) ?? createStaffWeightedPipelineGroup(row);
    addStaffWeightedPipelineValue(group, row);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map(group => ({
      branchId: group.branchId ?? null,
      branchLabel: branchLabel(group.branchId ?? null, labels),
      currencyCode: group.currencyCode,
      excludedInconsistentForecastCount,
      forecastBestAmountMinor: group.forecastBestAmountMinor,
      forecastCommitAmountMinor: group.forecastCommitAmountMinor,
      openDealCount: group.openDealCount,
      pipelineId: group.pipelineId,
      pipelineLabel: pipelineLabel(group.pipelineId),
      totalPipelineAmountMinor: group.rawValueAmountMinor,
      weightedPipelineAmountMinor: group.weightedValueAmountMinor,
    }))
    .sort((left, right) => {
      if (right.openDealCount !== left.openDealCount)
        return right.openDealCount - left.openDealCount;
      if (right.weightedPipelineAmountMinor !== left.weightedPipelineAmountMinor) {
        return right.weightedPipelineAmountMinor - left.weightedPipelineAmountMinor;
      }
      const byBranch = left.branchLabel.localeCompare(right.branchLabel);
      if (byBranch !== 0) return byBranch;
      const byPipeline = left.pipelineLabel.localeCompare(right.pipelineLabel);
      if (byPipeline !== 0) return byPipeline;
      return left.currencyCode.localeCompare(right.currencyCode);
    })
    .slice(0, STAFF_CRM_PIPELINE_MAX_ROWS);
}

export function pipelineLabel(pipelineId: string): string {
  return pipelineId;
}

export function branchLabel(
  branchId: string | null,
  labels: Required<StaffCrmReportingCoreOptions>['labels']
) {
  return branchId ?? labels.noBranch ?? 'No branch';
}
