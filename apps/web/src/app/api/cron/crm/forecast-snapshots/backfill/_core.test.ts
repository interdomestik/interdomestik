import { describe, expect, it, vi } from 'vitest';

import type { CrmForecastSnapshotWorkItem } from '@/adapters/crm/forecast-snapshot-work-items';

import {
  CRM_FORECAST_SNAPSHOT_BACKFILL_NO_BRANCH_SENTINEL,
  CRM_FORECAST_SNAPSHOT_BACKFILL_SYSTEM_ACTOR_ID,
  buildBackfillSnapshotIdempotencyKey,
  getCrmForecastSnapshotBackfillStatus,
  logCrmForecastSnapshotBackfillResult,
  runCrmForecastSnapshotBackfillCore,
  validateBackfillDateRange,
} from './_core';
import {
  createCrmForecastSnapshotTestDeps,
  createCrmForecastSnapshotWeightedRow,
  crmForecastSnapshotTestWorkItem,
} from '../_core.test-helpers';

const now = new Date('2026-05-15T10:30:00.000Z');
const workItem: CrmForecastSnapshotWorkItem = crmForecastSnapshotTestWorkItem;
const weightedRow = createCrmForecastSnapshotWeightedRow;
const createDeps = createCrmForecastSnapshotTestDeps;

describe('validateBackfillDateRange', () => {
  it('accepts an inclusive historical range only before the current UTC date', () => {
    expect(validateBackfillDateRange('2026-05-12', '2026-05-14', now)).toEqual([
      '2026-05-12',
      '2026-05-13',
      '2026-05-14',
    ]);
  });

  it('rejects invalid, too large, current-day, future, and too old ranges', () => {
    expect(() => validateBackfillDateRange('2026-02-30', '2026-05-14', now)).toThrow(
      'Invalid CRM forecast snapshot backfill date'
    );
    expect(() => validateBackfillDateRange('2026-05-10', '2026-05-17', now)).toThrow(
      'date must be before today'
    );
    expect(() => validateBackfillDateRange('2026-05-08', '2026-05-14', now)).not.toThrow();
    expect(() => validateBackfillDateRange('2026-05-07', '2026-05-14', now)).toThrow(
      'range is too large'
    );
    expect(() => validateBackfillDateRange('2025-05-12', '2025-05-14', now)).toThrow(
      'out of bounds'
    );
  });
});

describe('runCrmForecastSnapshotBackfillCore', () => {
  it('processes tenant-scoped dates with fresh per-date reporting caches and append-only inserts', async () => {
    const deps = createDeps();

    const result = await runCrmForecastSnapshotBackfillCore({
      ...deps,
      fromDate: '2026-05-13',
      maxWorkItemsPerDate: 1,
      now,
      sourceRunId: 'run-1',
      tenantId: 'tenant-1',
      toDate: '2026-05-14',
    });

    expect(result).toMatchObject({
      datesConsidered: 2,
      datesDeferred: 0,
      datesFailed: 0,
      datesSucceeded: 2,
      failedWorkItems: 0,
      fromDate: '2026-05-13',
      snapshotsInserted: 2,
      sourceRunId: 'run-1',
      tenantId: 'tenant-1',
      toDate: '2026-05-14',
      workItemsConsidered: 2,
      workItemsSucceeded: 2,
    });
    expect(deps.workItemRepository.listWorkItems).toHaveBeenNthCalledWith(1, {
      limit: 1,
      snapshotDateEndExclusive: new Date('2026-05-14T00:00:00.000Z'),
      snapshotDateStartInclusive: new Date('2025-04-09T00:00:00.000Z'),
      tenantId: 'tenant-1',
    });
    expect(deps.workItemRepository.listWorkItems).toHaveBeenNthCalledWith(2, {
      limit: 1,
      snapshotDateEndExclusive: new Date('2026-05-15T00:00:00.000Z'),
      snapshotDateStartInclusive: new Date('2025-04-10T00:00:00.000Z'),
      tenantId: 'tenant-1',
    });
    expect(deps.reportingRepository.listWeightedPipelineRows).toHaveBeenCalledTimes(2);
    expect(deps.reportingRepository.listWeightedPipelineRows).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          actorId: CRM_FORECAST_SNAPSHOT_BACKFILL_SYSTEM_ACTOR_ID,
          role: 'admin',
          tenantId: 'tenant-1',
        }),
      })
    );
    expect(deps.snapshotRepository.insertPipelineSnapshots).toHaveBeenCalledWith({
      snapshots: [
        expect.objectContaining({
          branchId: 'branch-1',
          currencyCode: 'EUR',
          idempotencyKey:
            'crm-forecast-snapshot-backfill:tenant-1:pipeline-1:branch-1:EUR:2026-05-13:run-1',
          pipelineId: 'pipeline-1',
          snapshotDate: '2026-05-13',
          sourceRunId: 'run-1',
          tenantId: 'tenant-1',
        }),
      ],
    });
  });

  it('keeps dry-run mode aggregate-only and never inserts snapshots', async () => {
    const deps = createDeps();

    const result = await runCrmForecastSnapshotBackfillCore({
      ...deps,
      dryRun: true,
      fromDate: '2026-05-14',
      now,
      tenantId: 'tenant-1',
      toDate: '2026-05-14',
    });

    expect(result).toMatchObject({
      dateResults: [expect.objectContaining({ snapshotsInserted: 0, status: 'dry_run' })],
      dryRun: true,
      snapshotsInserted: 0,
      workItemsSucceeded: 1,
    });
    expect(deps.snapshotRepository.insertPipelineSnapshots).not.toHaveBeenCalled();
  });

  it('does not hide dry-run derivation failures behind the dry-run status', async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const deps = createDeps();
    deps.reportingRepository.listWeightedPipelineRows.mockRejectedValue(new Error('db down'));

    const result = await runCrmForecastSnapshotBackfillCore({
      ...deps,
      dryRun: true,
      fromDate: '2026-05-14',
      logger,
      now,
      tenantId: 'tenant-1',
      toDate: '2026-05-14',
    });

    expect(result.dateResults[0]).toMatchObject({
      failedWorkItems: 1,
      status: 'failed',
      workItemsSucceeded: 0,
    });
    expect(getCrmForecastSnapshotBackfillStatus(result)).toBe(500);
    expect(deps.snapshotRepository.insertPipelineSnapshots).not.toHaveBeenCalled();
  });

  it('filters weighted rows by exact tenant, pipeline, branch, and currency before deriving', async () => {
    const deps = createDeps({
      rows: [
        weightedRow({ tenantId: 'tenant-2' }),
        weightedRow({ branchId: null }),
        weightedRow({ currencyCode: 'USD' }),
        weightedRow({ pipelineId: 'pipeline-2' }),
      ],
    });

    const result = await runCrmForecastSnapshotBackfillCore({
      ...deps,
      fromDate: '2026-05-14',
      now,
      tenantId: 'tenant-1',
      toDate: '2026-05-14',
    });

    expect(result).toMatchObject({
      failedWorkItems: 0,
      snapshotsInserted: 0,
      workItemsConsidered: 1,
      workItemsSucceeded: 1,
    });
    expect(deps.snapshotRepository.insertPipelineSnapshots).not.toHaveBeenCalled();
  });

  it('counts cap deferrals and version conflicts without treating them as failed work items', async () => {
    const deps = createDeps({ insertResult: 'version_conflict', workItemsDeferred: 3 });

    const result = await runCrmForecastSnapshotBackfillCore({
      ...deps,
      fromDate: '2026-05-14',
      now,
      tenantId: 'tenant-1',
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
      tenantId: 'tenant-1',
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
      tenantId: 'tenant-1',
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
      workItems: [
        workItem,
        { ...workItem, pipelineId: 'pipeline-2', tenantId: 'tenant-2' },
        { ...workItem, pipelineId: 'pipeline-3', tenantId: 'tenant-3' },
      ],
    });
    deps.reportingRepository.listWeightedPipelineRows.mockReturnValue(new Promise(() => {}));

    const result = await runCrmForecastSnapshotBackfillCore({
      ...deps,
      fromDate: '2026-05-14',
      logger,
      now,
      tenantId: 'tenant-1',
      toDate: '2026-05-14',
      workItemSoftTimeoutMs: 1,
    });

    expect(result.dateResults[0]).toMatchObject({
      failedWorkItems: 2,
      status: 'partial',
      workItemsDeferred: 1,
      workItemsSucceeded: 0,
    });
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
      tenantId: 'tenant-1',
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
