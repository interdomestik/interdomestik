import type {
  CrmForecastSnapshotBackfillDateResult,
  CrmForecastSnapshotBackfillDateStatus,
} from './_core';

export function getCrmForecastSnapshotBackfillDateStatus(
  result: CrmForecastSnapshotBackfillDateResult,
  dryRun: boolean
): CrmForecastSnapshotBackfillDateStatus {
  if (result.workItemsConsidered > 0 && result.failedWorkItems === result.workItemsConsidered) {
    return 'failed';
  }
  if (result.failedWorkItems > 0 || result.workItemsDeferred > 0) return 'partial';
  if (dryRun) return 'dry_run';
  return 'completed';
}
