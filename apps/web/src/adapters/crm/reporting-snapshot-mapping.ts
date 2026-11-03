import type { CrmForecastSnapshotRow } from '@interdomestik/domain-crm/reporting';
import type { CrmPipelineSnapshotRecord } from '@interdomestik/domain-crm/reporting/repository';

import type { crmPipelineSnapshots } from '@interdomestik/database/schema';

export type SnapshotRow = typeof crmPipelineSnapshots.$inferSelect;

export function mapSnapshotRecord(row: SnapshotRow): CrmPipelineSnapshotRecord {
  return {
    branchId: row.branchId,
    closedLostAmountMinor: row.closedLostAmountMinor,
    closedWonAmountMinor: row.closedWonAmountMinor,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    currencyCode: row.currencyCode,
    forecastBestAmountMinor: row.forecastBestAmountMinor,
    forecastCommitAmountMinor: row.forecastCommitAmountMinor,
    forecastOmittedAmountMinor: row.forecastOmittedAmountMinor,
    forecastPipelineAmountMinor: row.forecastPipelineAmountMinor,
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    openDealCount: row.openDealCount,
    pipelineId: row.pipelineId,
    rawValueAmountMinor: row.rawValueAmountMinor,
    snapshotDate: row.snapshotDate,
    snapshotVersion: row.snapshotVersion,
    sourceRunId: row.sourceRunId,
    tenantId: row.tenantId,
    weightedValueAmountMinor: row.weightedValueAmountMinor,
  };
}

export function snapshotInsertValues(
  snapshot: CrmForecastSnapshotRow,
  params: { id: string; snapshotVersion: number }
) {
  return {
    branchId: snapshot.branchId ?? null,
    closedLostAmountMinor: snapshot.closedLostAmountMinor,
    closedWonAmountMinor: snapshot.closedWonAmountMinor,
    createdAt: new Date(snapshot.createdAt),
    createdById: snapshot.createdById ?? null,
    currencyCode: snapshot.currencyCode,
    forecastBestAmountMinor: snapshot.forecastBestAmountMinor,
    forecastCommitAmountMinor: snapshot.forecastCommitAmountMinor,
    forecastOmittedAmountMinor: snapshot.forecastOmittedAmountMinor,
    forecastPipelineAmountMinor: snapshot.forecastPipelineAmountMinor,
    id: params.id,
    idempotencyKey: snapshot.idempotencyKey ?? null,
    metadata: null,
    openDealCount: snapshot.openDealCount,
    pipelineId: snapshot.pipelineId,
    rawValueAmountMinor: snapshot.rawValueAmountMinor,
    snapshotDate: snapshot.snapshotDate,
    snapshotVersion: params.snapshotVersion,
    sourceRunId: snapshot.sourceRunId ?? null,
    tenantId: snapshot.tenantId,
    weightedValueAmountMinor: snapshot.weightedValueAmountMinor,
  };
}

export function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

export function snapshotKey(snapshot: CrmForecastSnapshotRow): string {
  return [
    snapshot.tenantId,
    snapshot.pipelineId,
    snapshot.branchId ?? '',
    snapshot.currencyCode,
    snapshot.snapshotDate,
  ].join('\u001f');
}

export function hasDuplicateSnapshotKeys(snapshots: readonly CrmForecastSnapshotRow[]): boolean {
  const seen = new Set<string>();
  for (const snapshot of snapshots) {
    const key = snapshotKey(snapshot);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}
