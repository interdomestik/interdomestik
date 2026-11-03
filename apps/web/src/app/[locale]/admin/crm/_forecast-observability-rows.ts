import { type CrmForecastSnapshotObservedRow } from '@/adapters/crm/forecast-snapshot-observability';
import type {
  AdminCrmForecastObservabilityStatus,
  AdminCrmForecastObservabilityCoverageRow,
  AdminCrmForecastObservabilityBatchRow,
} from './_core';

export const ADMIN_CRM_FORECAST_OBSERVABILITY_MAX_BATCH_ROWS = 10;

export function branchLabel(branchId: string | null): string {
  return branchId ?? 'tenant';
}

export function pipelineLabel(pipelineId: string): string {
  return pipelineId;
}

export function workItemKey(input: {
  branchId?: string | null;
  currencyCode: string;
  pipelineId: string;
  tenantId: string;
}): string {
  return [input.tenantId, input.pipelineId, input.branchId ?? '', input.currencyCode].join(
    '\u001f'
  );
}

export function compareCoverageRows(
  left: AdminCrmForecastObservabilityCoverageRow,
  right: AdminCrmForecastObservabilityCoverageRow
): number {
  const severity: Record<AdminCrmForecastObservabilityStatus, number> = {
    missing: 0,
    stale: 1,
    delayed: 2,
    fresh: 3,
  };
  const byStatus = severity[left.status] - severity[right.status];
  if (byStatus !== 0) return byStatus;
  const byBranchLabel = left.branchLabel.localeCompare(right.branchLabel);
  if (byBranchLabel !== 0) return byBranchLabel;
  const byPipelineLabel = left.pipelineLabel.localeCompare(right.pipelineLabel);
  if (byPipelineLabel !== 0) return byPipelineLabel;
  const byCurrency = left.currencyCode.localeCompare(right.currencyCode);
  if (byCurrency !== 0) return byCurrency;
  const byBranchId = (left.branchId ?? '').localeCompare(right.branchId ?? '');
  if (byBranchId !== 0) return byBranchId;
  return left.pipelineId.localeCompare(right.pipelineId);
}

export function deriveBatchRows(
  rows: readonly CrmForecastSnapshotObservedRow[]
): AdminCrmForecastObservabilityBatchRow[] {
  const missingSourceRunKey = '\u0000missing-source-run';
  const batches = new Map<
    string,
    {
      branches: Set<string>;
      currencies: Set<string>;
      firstSnapshotCreatedAt: string;
      lastSnapshotCreatedAt: string;
      pipelines: Set<string>;
      snapshotDate: string;
      sourceRunId: string | null;
      workItems: Set<string>;
    }
  >();

  for (const row of rows) {
    const sourceRunKey = row.sourceRunId ?? missingSourceRunKey;
    const existing = batches.get(sourceRunKey);
    const batch = existing ?? {
      branches: new Set<string>(),
      currencies: new Set<string>(),
      firstSnapshotCreatedAt: row.createdAt,
      lastSnapshotCreatedAt: row.createdAt,
      pipelines: new Set<string>(),
      snapshotDate: row.snapshotDate,
      sourceRunId: row.sourceRunId,
      workItems: new Set<string>(),
    };
    batch.firstSnapshotCreatedAt =
      row.createdAt < batch.firstSnapshotCreatedAt ? row.createdAt : batch.firstSnapshotCreatedAt;
    batch.lastSnapshotCreatedAt =
      row.createdAt > batch.lastSnapshotCreatedAt ? row.createdAt : batch.lastSnapshotCreatedAt;
    batch.branches.add(row.branchId ?? '');
    batch.currencies.add(row.currencyCode);
    batch.pipelines.add(row.pipelineId);
    batch.workItems.add(workItemKey(row));
    batches.set(sourceRunKey, batch);
  }

  return [...batches.entries()]
    .map(([, batch]) => ({
      branchCount: batch.branches.size,
      currencyCount: batch.currencies.size,
      firstSnapshotCreatedAt: batch.firstSnapshotCreatedAt,
      lastSnapshotCreatedAt: batch.lastSnapshotCreatedAt,
      observedWorkItems: batch.workItems.size,
      pipelineCount: batch.pipelines.size,
      snapshotDate: batch.snapshotDate,
      sourceRunId: batch.sourceRunId,
    }))
    .sort((left, right) => {
      const byLastSnapshot = right.lastSnapshotCreatedAt.localeCompare(left.lastSnapshotCreatedAt);
      if (byLastSnapshot !== 0) return byLastSnapshot;
      return (left.sourceRunId ?? '').localeCompare(right.sourceRunId ?? '');
    })
    .slice(0, ADMIN_CRM_FORECAST_OBSERVABILITY_MAX_BATCH_ROWS);
}
