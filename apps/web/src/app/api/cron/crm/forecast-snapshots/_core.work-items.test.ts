import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDeps,
  hoisted,
  ingress,
  now,
  scheduleTenants,
  weightedRow,
  workItem,
} from './_core.test-support';
import {
  buildSnapshotIdempotencyKey,
  CRM_FORECAST_SNAPSHOT_NO_BRANCH_SENTINEL,
  assertNoCrmForecastSnapshotSchedulerPiiKeys,
  getCrmForecastSnapshotSchedulerStatus,
  logCrmForecastSnapshotSchedulerResult,
  runCrmForecastSnapshotSchedulerCore,
} from './_core';

beforeEach(() => {
  vi.clearAllMocks();
  scheduleTenants('tenant-1');
});

describe('runCrmForecastSnapshotSchedulerCore', () => {
  it('asks the cron-admitted producer for the tenants of the run', async () => {
    const deps = createDeps();

    await runCrmForecastSnapshotSchedulerCore({ ...deps, ingress, now });

    expect(hoisted.listScheduledTenantWork).toHaveBeenCalledTimes(1);
    expect(hoisted.listScheduledTenantWork).toHaveBeenCalledWith(ingress);
  });

  it('counts partial failures and returns 500 only when every selected item fails', async () => {
    scheduleTenants('tenant-1', 'tenant-2');
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const deps = createDeps({
      workItems: [workItem, { ...workItem, tenantId: 'tenant-2', pipelineId: 'pipeline-2' }],
    });
    deps.reportingRepository.listWeightedPipelineRows
      .mockRejectedValueOnce(new Error('db unavailable'))
      .mockResolvedValueOnce([weightedRow({ tenantId: 'tenant-2', pipelineId: 'pipeline-2' })]);

    const result = await runCrmForecastSnapshotSchedulerCore({ ...deps, ingress, logger, now });

    expect(result.failedWorkItems).toBe(1);
    expect(result.workItemsSucceeded).toBe(1);
    expect(getCrmForecastSnapshotSchedulerStatus(result)).toBe(200);
    expect(logger.warn).toHaveBeenCalledWith(
      '[CRM Forecast Snapshot Scheduler] work item failed',
      expect.objectContaining({
        branchId: 'branch-1',
        currencyCode: 'EUR',
        errorMessage: 'db unavailable',
        pipelineId: 'pipeline-1',
        tenantId: 'tenant-1',
      })
    );

    const failedDeps = createDeps();
    failedDeps.reportingRepository.listWeightedPipelineRows.mockRejectedValue(new Error('down'));
    const failed = await runCrmForecastSnapshotSchedulerCore({
      ...failedDeps,
      ingress,
      logger,
      now,
    });
    expect(failed.failedWorkItems).toBe(1);
    expect(getCrmForecastSnapshotSchedulerStatus(failed)).toBe(500);
  });

  it('soft-times out individual work items and defers remaining work', async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const deps = createDeps({
      workItems: [workItem, { ...workItem, tenantId: 'tenant-2', pipelineId: 'pipeline-2' }],
    });
    deps.reportingRepository.listWeightedPipelineRows.mockReturnValue(new Promise(() => {}));

    const result = await runCrmForecastSnapshotSchedulerCore({
      ...deps,
      ingress,
      logger,
      now,
      workItemSoftTimeoutMs: 1,
    });

    expect(result.failedWorkItems).toBe(1);
    expect(result.workItemsSucceeded).toBe(0);
    expect(result.workItemsDeferred).toBe(1);
    expect(deps.reportingRepository.listWeightedPipelineRows).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      '[CRM Forecast Snapshot Scheduler] work item timed out',
      expect.objectContaining({
        branchId: 'branch-1',
        currencyCode: 'EUR',
        errorMessage: 'CRM forecast snapshot timed out',
        pipelineId: 'pipeline-1',
        tenantId: 'tenant-1',
      })
    );
  });

  it('uses the no-branch sentinel in idempotency keys', () => {
    expect(
      buildSnapshotIdempotencyKey(
        { ...workItem, branchId: null },
        { snapshotDate: '2026-05-13', sourceRunId: 'run-1' }
      )
    ).toBe(
      `crm-forecast-snapshot:tenant-1:pipeline-1:${CRM_FORECAST_SNAPSHOT_NO_BRANCH_SENTINEL}:EUR:2026-05-13:run-1`
    );
  });

  it('logs exactly one structured run line with severity based on counters', () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const result = {
      completedAt: '2026-05-14T05:15:01.000Z',
      failedWorkItems: 0,
      snapshotDate: '2026-05-13',
      snapshotsInserted: 1,
      sourceRunId: 'run-1',
      startedAt: '2026-05-14T05:15:00.000Z',
      versionConflicts: 0,
      workItemsConsidered: 1,
      workItemsDeferred: 0,
      workItemsSucceeded: 1,
    };

    logCrmForecastSnapshotSchedulerResult(result, 200, logger);
    expect(logger.info).toHaveBeenCalledWith(
      '[CRM Forecast Snapshot Scheduler] run completed',
      expect.objectContaining({ durationMs: 1000, sourceRunId: 'run-1' })
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();

    logCrmForecastSnapshotSchedulerResult({ ...result, workItemsDeferred: 1 }, 200, logger);
    expect(logger.warn).toHaveBeenCalledTimes(1);

    logCrmForecastSnapshotSchedulerResult({ ...result, failedWorkItems: 1 }, 500, logger);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('rejects PII-shaped output keys', () => {
    expect(() =>
      assertNoCrmForecastSnapshotSchedulerPiiKeys({
        result: { email: 'person@example.com' },
      })
    ).toThrow('PII key');
  });
});
