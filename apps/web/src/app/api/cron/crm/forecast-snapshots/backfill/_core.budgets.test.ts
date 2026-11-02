import { describe, expect, it, vi } from 'vitest';
import { TEST_AUTHORITY, createDeps, now, weightedRow, workItem } from './_core.test-support';
import {
  CRM_FORECAST_SNAPSHOT_BACKFILL_NO_BRANCH_SENTINEL,
  buildBackfillSnapshotIdempotencyKey,
  getCrmForecastSnapshotBackfillStatus,
  logCrmForecastSnapshotBackfillResult,
  runCrmForecastSnapshotBackfillCore,
} from './_core';

describe('runCrmForecastSnapshotBackfillCore', () => {
  it('counts cap deferrals and version conflicts without treating them as failed work items', async () => {
    const deps = createDeps({ insertResult: 'version_conflict', workItemsDeferred: 3 });

    const result = await runCrmForecastSnapshotBackfillCore({
      ...deps,
      fromDate: '2026-05-14',
      now,
      authority: TEST_AUTHORITY,
      toDate: '2026-05-14',
    });

    expect(result).toMatchObject({
      dateResults: [
        expect.objectContaining({
          failedWorkItems: 0,
          status: 'partial',
          versionConflicts: 1,
          workItemsDeferred: 3,
          workItemsSucceeded: 0,
        }),
      ],
      versionConflicts: 1,
    });
    expect(getCrmForecastSnapshotBackfillStatus(result)).toBe(200);
  });

  it('marks all remaining dates deferred when the global duration budget is reached before a date starts', async () => {
    const deps = createDeps();
    const nowMs = vi
      .fn()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_500)
      .mockReturnValue(61_001);

    const result = await runCrmForecastSnapshotBackfillCore({
      ...deps,
      fromDate: '2026-05-12',
      now,
      nowMs,
      targetDurationMs: 60_000,
      authority: TEST_AUTHORITY,
      toDate: '2026-05-14',
    });

    expect(result.dateResults.map(row => row.status)).toEqual([
      'completed',
      'deferred',
      'deferred',
    ]);
    expect(result.datesDeferred).toBe(2);
    expect(deps.workItemRepository.listWorkItems).toHaveBeenCalledTimes(1);
  });

  it('stops starting more work items within a date after the global duration budget is reached', async () => {
    const deps = createDeps({
      rows: [weightedRow(), weightedRow({ pipelineId: 'pipeline-2', tenantId: 'tenant-2' })],
      workItems: [
        workItem,
        { ...workItem, pipelineId: 'pipeline-2', tenantId: 'tenant-2' },
        { ...workItem, pipelineId: 'pipeline-3', tenantId: 'tenant-3' },
      ],
    });
    let nowCalls = 0;
    const nowMs = vi.fn(() => {
      nowCalls += 1;
      return nowCalls <= 6 ? 1_000 : 61_001;
    });

    const result = await runCrmForecastSnapshotBackfillCore({
      ...deps,
      fromDate: '2026-05-14',
      now,
      nowMs,
      targetDurationMs: 60_000,
      authority: TEST_AUTHORITY,
      toDate: '2026-05-14',
    });

    expect(result.dateResults[0]).toMatchObject({
      status: 'partial',
      snapshotsInserted: 2,
      workItemsConsidered: 3,
      workItemsDeferred: 1,
      workItemsSucceeded: 2,
    });
  });

  it('soft-times out individual work items and defers the rest of the date', async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const deps = createDeps({
      workItems: [workItem, { ...workItem, pipelineId: 'pipeline-2', tenantId: 'tenant-2' }],
    });
    deps.reportingRepository.listWeightedPipelineRows.mockReturnValue(new Promise(() => {}));

    const result = await runCrmForecastSnapshotBackfillCore({
      ...deps,
      fromDate: '2026-05-14',
      logger,
      now,
      authority: TEST_AUTHORITY,
      toDate: '2026-05-14',
      workItemSoftTimeoutMs: 1,
    });

    expect(result.dateResults[0]).toMatchObject({
      failedWorkItems: 1,
      status: 'partial',
      workItemsDeferred: 1,
      workItemsSucceeded: 0,
    });
    expect(result.datesFailed).toBe(0);
    expect(getCrmForecastSnapshotBackfillStatus(result)).toBe(200);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('returns 500 only when every considered date fails', async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const deps = createDeps();
    deps.reportingRepository.listWeightedPipelineRows.mockRejectedValue(new Error('db down'));

    const result = await runCrmForecastSnapshotBackfillCore({
      ...deps,
      fromDate: '2026-05-14',
      logger,
      now,
      authority: TEST_AUTHORITY,
      toDate: '2026-05-14',
    });

    expect(result.dateResults[0]).toMatchObject({ failedWorkItems: 1, status: 'failed' });
    expect(getCrmForecastSnapshotBackfillStatus(result)).toBe(500);
  });
});

describe('backfill utility helpers', () => {
  it('uses a distinct idempotency namespace and no-branch sentinel', () => {
    expect(
      buildBackfillSnapshotIdempotencyKey(
        { ...workItem, branchId: null },
        { snapshotDate: '2026-05-14', sourceRunId: 'run-1' }
      )
    ).toBe(
      `crm-forecast-snapshot-backfill:tenant-1:pipeline-1:${CRM_FORECAST_SNAPSHOT_BACKFILL_NO_BRANCH_SENTINEL}:EUR:2026-05-14:run-1`
    );
  });

  it('emits the backfill log prefix with aggregate-only payloads', () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    logCrmForecastSnapshotBackfillResult(
      {
        completedAt: '2026-05-15T10:30:01.000Z',
        dateResults: [],
        datesConsidered: 0,
        datesDeferred: 0,
        datesFailed: 0,
        datesSucceeded: 0,
        dryRun: false,
        failedWorkItems: 0,
        fromDate: '2026-05-14',
        snapshotsInserted: 0,
        sourceRunId: 'run-1',
        startedAt: '2026-05-15T10:30:00.000Z',
        tenantId: 'tenant-1',
        toDate: '2026-05-14',
        versionConflicts: 0,
        workItemsConsidered: 0,
        workItemsDeferred: 0,
        workItemsSucceeded: 0,
      },
      200,
      logger
    );

    expect(logger.info).toHaveBeenCalledWith(
      '[CRM Forecast Snapshot Backfill] run completed',
      expect.objectContaining({
        sourceRunId: 'run-1',
        tenantId: 'tenant-1',
      })
    );
  });
});
