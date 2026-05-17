import type { CrmWeightedPipelineRow } from '@interdomestik/domain-crm/reporting';
import type { CrmForecastSnapshotRow } from '@interdomestik/domain-crm/reporting/types';
import { vi } from 'vitest';

import type { CrmForecastSnapshotWorkItem } from '@/adapters/crm/forecast-snapshot-work-items';

import type { CrmForecastSnapshotBackfillResult } from './backfill/_core';

export const crmForecastSnapshotTestWorkItem: CrmForecastSnapshotWorkItem = {
  branchId: 'branch-1',
  currencyCode: 'EUR',
  pipelineId: 'pipeline-1',
  tenantId: 'tenant-1',
};

export function createCrmForecastSnapshotWeightedRow(
  overrides: Partial<CrmWeightedPipelineRow> = {}
): CrmWeightedPipelineRow {
  return {
    agentId: 'agent-1',
    archivedAt: null,
    branchId: 'branch-1',
    currencyCode: 'EUR',
    currentStageId: 'stage-1',
    dealId: 'deal-1',
    forecastCategory: 'commit',
    isLostStage: false,
    isWonStage: false,
    lossReasonId: null,
    pipelineId: 'pipeline-1',
    source: null,
    stageProbability: 50,
    tenantId: 'tenant-1',
    utmCampaign: null,
    utmMedium: null,
    utmSource: null,
    valueAmountMinor: 10_000,
    ...overrides,
  };
}

export function createCrmForecastSnapshotTestDeps(
  args: {
    insertResult?: 'success' | 'version_conflict';
    rows?: CrmWeightedPipelineRow[];
    workItems?: CrmForecastSnapshotWorkItem[];
    workItemsDeferred?: number;
  } = {}
) {
  const rows = args.rows ?? [createCrmForecastSnapshotWeightedRow()];
  const workItems = args.workItems ?? [crmForecastSnapshotTestWorkItem];
  const workItemRepository = {
    listWorkItems: vi.fn().mockResolvedValue({
      workItems,
      workItemsDeferred: args.workItemsDeferred ?? 0,
    }),
  };
  const reportingRepository = {
    listAgentLeaderboardRows: vi.fn(),
    listFunnelConversionRows: vi.fn(),
    listSourceBreakdownRows: vi.fn(),
    listStageVelocityRows: vi.fn(),
    listWeightedPipelineRows: vi.fn().mockResolvedValue(rows),
    listWinRateRows: vi.fn(),
  };
  const snapshotRepository = {
    insertPipelineSnapshots: vi
      .fn()
      .mockImplementation((params: { snapshots: readonly CrmForecastSnapshotRow[] }) => {
        if (args.insertResult === 'version_conflict') {
          return Promise.resolve({ success: false, reason: 'version_conflict' });
        }
        return Promise.resolve({
          success: true,
          snapshots: params.snapshots.map((snapshot, index) => ({
            ...snapshot,
            id: `snapshot-${index}`,
            snapshotVersion: 1,
          })),
        });
      }),
    listLatestPipelineSnapshots: vi.fn(),
  };

  return { reportingRepository, snapshotRepository, workItemRepository };
}

export function createCrmForecastSnapshotBackfillResult(
  overrides: Partial<CrmForecastSnapshotBackfillResult> = {}
): CrmForecastSnapshotBackfillResult {
  return {
    completedAt: '2026-05-15T10:30:01.000Z',
    dateResults: [
      {
        failedWorkItems: 0,
        snapshotDate: '2026-05-14',
        snapshotsInserted: 1,
        status: 'completed',
        versionConflicts: 0,
        workItemsConsidered: 1,
        workItemsDeferred: 0,
        workItemsSucceeded: 1,
      },
    ],
    datesConsidered: 1,
    datesDeferred: 0,
    datesFailed: 0,
    datesSucceeded: 1,
    dryRun: false,
    failedWorkItems: 0,
    fromDate: '2026-05-14',
    snapshotsInserted: 1,
    sourceRunId: 'run-1',
    startedAt: '2026-05-15T10:30:00.000Z',
    tenantId: 'tenant-1',
    toDate: '2026-05-14',
    versionConflicts: 0,
    workItemsConsidered: 1,
    workItemsDeferred: 0,
    workItemsSucceeded: 1,
    ...overrides,
  };
}
