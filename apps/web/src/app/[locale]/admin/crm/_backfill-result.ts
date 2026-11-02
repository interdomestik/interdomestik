import {
  CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_DAYS,
  type CrmForecastSnapshotBackfillDateResult,
  type CrmForecastSnapshotBackfillResult,
} from '../../../api/cron/crm/forecast-snapshots/backfill/_core';
import {
  type AdminCrmForecastBackfillConfirmationStore,
  type AdminCrmForecastBackfillConfirmationTuple,
} from './_backfill-confirmation';
import {
  type AdminCrmForecastBackfillOperatorDateRow,
  type AdminCrmForecastBackfillOperatorMode,
  type AdminCrmForecastBackfillOperatorResult,
  type AdminCrmForecastBackfillOperatorResultStatus,
} from './_backfill-types';

export const ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_MAX_DATE_ROWS =
  CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_DAYS;

export function projectBackfillResult(args: {
  confirmationStore: AdminCrmForecastBackfillConfirmationStore;
  coreResult: CrmForecastSnapshotBackfillResult;
  generatedAt: string;
  mode: AdminCrmForecastBackfillOperatorMode;
  tuple: AdminCrmForecastBackfillConfirmationTuple;
}): AdminCrmForecastBackfillOperatorResult {
  const status = aggregateStatus(args.coreResult);
  const confirmationToken =
    args.mode === 'dry_run' && status !== 'failed'
      ? args.confirmationStore.create(args.tuple, args.coreResult.completedAt)
      : null;
  const dateRows = args.coreResult.dateResults
    .map(projectDateRow)
    .sort((left, right) => left.snapshotDate.localeCompare(right.snapshotDate))
    .slice(0, ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_MAX_DATE_ROWS);

  return {
    confirmationToken,
    dateRows,
    datesCompleted: args.coreResult.dateResults.filter(
      row => row.status === 'completed' || row.status === 'dry_run'
    ).length,
    datesConsidered: args.coreResult.datesConsidered,
    datesDeferred: args.coreResult.datesDeferred,
    datesFailed: args.coreResult.datesFailed,
    datesPartial: args.coreResult.dateResults.filter(row => row.status === 'partial').length,
    fromDate: args.coreResult.fromDate,
    generatedAt: args.generatedAt,
    mode: args.mode,
    snapshotVersionConflicts: args.coreResult.versionConflicts,
    snapshotsInserted: args.mode === 'dry_run' ? 0 : args.coreResult.snapshotsInserted,
    sourceRunId: args.coreResult.sourceRunId ?? null,
    status,
    tenantId: args.coreResult.tenantId,
    toDate: args.coreResult.toDate,
    workItemsConsidered: args.coreResult.workItemsConsidered,
    workItemsDeferred: args.coreResult.workItemsDeferred,
    workItemsFailed: args.coreResult.failedWorkItems,
    workItemsSucceeded: args.coreResult.workItemsSucceeded,
  };
}

export function aggregateStatus(
  result: CrmForecastSnapshotBackfillResult
): AdminCrmForecastBackfillOperatorResultStatus {
  if (result.datesConsidered > 0 && result.datesFailed === result.datesConsidered) {
    return 'failed';
  }
  if (
    result.datesDeferred > 0 ||
    result.datesFailed > 0 ||
    result.failedWorkItems > 0 ||
    result.workItemsDeferred > 0
  ) {
    return 'partial';
  }
  return 'completed';
}

export function projectDateRow(
  row: CrmForecastSnapshotBackfillDateResult
): AdminCrmForecastBackfillOperatorDateRow {
  return {
    failedWorkItems: row.failedWorkItems,
    snapshotDate: row.snapshotDate,
    snapshotsInserted: row.snapshotsInserted,
    status: projectDateStatus(row.status),
    versionConflicts: row.versionConflicts,
    workItemsConsidered: row.workItemsConsidered,
    workItemsDeferred: row.workItemsDeferred,
    workItemsSucceeded: row.workItemsSucceeded,
  };
}

export function projectDateStatus(
  status: CrmForecastSnapshotBackfillDateResult['status']
): AdminCrmForecastBackfillOperatorDateRow['status'] {
  if (status === 'dry_run') return 'completed';
  if (
    status === 'completed' ||
    status === 'deferred' ||
    status === 'failed' ||
    status === 'partial'
  ) {
    return status;
  }
  return 'partial';
}

export function logOperatorResult(
  result: AdminCrmForecastBackfillOperatorResult,
  args: {
    actorId: string;
    logger: Pick<Console, 'info' | 'warn'>;
    tokenId: string | null;
  }
): void {
  const payload = {
    actorId: args.actorId,
    confirmationTokenId: args.tokenId,
    fromDate: result.fromDate,
    mode: result.mode,
    outcome: result.status,
    snapshotsInserted: result.snapshotsInserted,
    tenantId: result.tenantId,
    toDate: result.toDate,
    versionConflicts: result.snapshotVersionConflicts,
  };
  if (result.status === 'partial' || result.status === 'failed') {
    args.logger.warn('[Admin CRM Forecast Backfill Operator] run completed with warnings', payload);
  } else {
    args.logger.info('[Admin CRM Forecast Backfill Operator] run completed', payload);
  }
}
