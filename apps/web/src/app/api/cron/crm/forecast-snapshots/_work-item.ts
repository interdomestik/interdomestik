import { type CrmReportingBaseInput } from '@interdomestik/domain-crm/reporting';
import { type CrmForecastSnapshotWorkItem } from '@/adapters/crm/forecast-snapshot-work-items';
import {
  buildCrmForecastSnapshotsForWorkItem,
  throwIfCrmForecastSnapshotAborted,
  type CrmForecastSnapshotTenantWeightedRows,
} from './_shared';
import type { CrmForecastSnapshotTenantRepositories } from './_core';

export const CRM_FORECAST_SNAPSHOT_IDEMPOTENCY_PREFIX = 'crm-forecast-snapshot';

export const CRM_FORECAST_SNAPSHOT_NO_BRANCH_SENTINEL = '_no_branch';

export const SYSTEM_ACTOR_ID = 'system:crm-forecast-snapshot-scheduler';

export const SOFT_TIMEOUT_MESSAGE = 'CRM forecast snapshot timed out';

export async function processWorkItem(args: {
  repositories: CrmForecastSnapshotTenantRepositories;
  signal: AbortSignal;
  snapshotDate: string;
  snapshotDateEndExclusive: Date;
  snapshotDateStartInclusive: Date;
  sourceRunId: string;
  tenantRows: CrmForecastSnapshotTenantWeightedRows;
  workItem: CrmForecastSnapshotWorkItem;
}): Promise<number | 'version_conflict'> {
  const snapshots = await buildCrmForecastSnapshotsForWorkItem({
    abortMessage: SOFT_TIMEOUT_MESSAGE,
    createdAt: new Date().toISOString(),
    idempotencyKey: buildSnapshotIdempotencyKey(args.workItem, {
      snapshotDate: args.snapshotDate,
      sourceRunId: args.sourceRunId,
    }),
    reportingInputFor,
    reportingRepository: args.repositories.reportingRepository,
    signal: args.signal,
    snapshotDate: args.snapshotDate,
    snapshotDateEndExclusive: args.snapshotDateEndExclusive,
    snapshotDateStartInclusive: args.snapshotDateStartInclusive,
    sourceRunId: args.sourceRunId,
    tenantRows: args.tenantRows,
    workItem: args.workItem,
  });

  if (snapshots.length === 0) return 0;
  throwIfCrmForecastSnapshotAborted(args.signal, SOFT_TIMEOUT_MESSAGE);
  const inserted = await args.repositories.snapshotRepository.insertPipelineSnapshots({
    snapshots,
  });
  throwIfCrmForecastSnapshotAborted(args.signal, SOFT_TIMEOUT_MESSAGE);
  if (!inserted.success) return inserted.reason;
  return inserted.snapshots.length;
}

export function reportingInputFor(tenantId: string, from: Date, to: Date): CrmReportingBaseInput {
  return {
    actor: {
      actorId: SYSTEM_ACTOR_ID,
      role: 'admin',
      scope: { permissions: ['crm:forecast-snapshot:scheduler'] },
      tenantId,
    },
    window: { from: from.toISOString(), to: to.toISOString() },
  };
}

export function buildSnapshotIdempotencyKey(
  workItem: CrmForecastSnapshotWorkItem,
  params: { snapshotDate: string; sourceRunId: string }
): string {
  return [
    CRM_FORECAST_SNAPSHOT_IDEMPOTENCY_PREFIX,
    workItem.tenantId,
    workItem.pipelineId,
    workItem.branchId ?? CRM_FORECAST_SNAPSHOT_NO_BRANCH_SENTINEL,
    workItem.currencyCode,
    params.snapshotDate,
    params.sourceRunId,
  ].join(':');
}
