import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ listScheduledTenantWork: vi.fn() }));

vi.mock('@interdomestik/database', () => ({
  listScheduledTenantWork: hoisted.listScheduledTenantWork,
}));

import type { CrmForecastSnapshotWorkItem } from '@/adapters/crm/forecast-snapshot-work-items';

import {
  buildSnapshotIdempotencyKey,
  CRM_FORECAST_SNAPSHOT_NO_BRANCH_SENTINEL,
  assertNoCrmForecastSnapshotSchedulerPiiKeys,
  getCrmForecastSnapshotSchedulerStatus,
  logCrmForecastSnapshotSchedulerResult,
  runCrmForecastSnapshotSchedulerCore,
} from './_core';
import {
  createCrmForecastSnapshotTestDeps,
  createCrmForecastSnapshotWeightedRow,
  crmForecastSnapshotTestAuthority,
  crmForecastSnapshotTestIngress,
  crmForecastSnapshotTestWorkItem,
} from './_core.test-helpers';

const now = new Date('2026-05-14T05:15:00.000Z');
const workItem: CrmForecastSnapshotWorkItem = crmForecastSnapshotTestWorkItem;
const weightedRow = createCrmForecastSnapshotWeightedRow;
const createDeps = createCrmForecastSnapshotTestDeps;
const ingress = crmForecastSnapshotTestIngress;

function scheduleTenants(...tenantIds: string[]) {
  hoisted.listScheduledTenantWork.mockResolvedValue(
    tenantIds.map(tenantId => ({ authority: crmForecastSnapshotTestAuthority(tenantId), tenantId }))
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  scheduleTenants('tenant-1');
});

describe('runCrmForecastSnapshotSchedulerCore', () => {
  it('uses the previous UTC date by default and writes append-only snapshots', async () => {
    const deps = createDeps();

    const result = await runCrmForecastSnapshotSchedulerCore({
      ...deps,
      ingress,
      now,
      sourceRunId: 'run-1',
    });

    expect(result).toMatchObject({
      failedWorkItems: 0,
      snapshotDate: '2026-05-13',
      snapshotsInserted: 1,
      sourceRunId: 'run-1',
      versionConflicts: 0,
      workItemsConsidered: 1,
      workItemsDeferred: 0,
      workItemsSucceeded: 1,
    });
    expect(deps.workItemRepository.listWorkItems).toHaveBeenCalledWith({
      limit: 1000,
      snapshotDateEndExclusive: new Date('2026-05-14T00:00:00.000Z'),
      snapshotDateStartInclusive: new Date('2025-04-09T00:00:00.000Z'),
    });
    expect(deps.snapshotRepository.insertPipelineSnapshots).toHaveBeenCalledWith({
      snapshots: [
        expect.objectContaining({
          branchId: 'branch-1',
          currencyCode: 'EUR',
          idempotencyKey: 'crm-forecast-snapshot:tenant-1:pipeline-1:branch-1:EUR:2026-05-13:run-1',
          pipelineId: 'pipeline-1',
          snapshotDate: '2026-05-13',
          sourceRunId: 'run-1',
          tenantId: 'tenant-1',
        }),
      ],
    });
  });

  it('accepts a manual override only for the previous UTC date', async () => {
    const deps = createDeps();
    await expect(
      runCrmForecastSnapshotSchedulerCore({
        ...deps,
        ingress,
        now,
        requestedDate: '2026-05-13',
      })
    ).resolves.toMatchObject({ snapshotDate: '2026-05-13' });

    await expect(
      runCrmForecastSnapshotSchedulerCore({
        ...deps,
        ingress,
        now,
        requestedDate: '2026-05-12',
      })
    ).rejects.toThrow('previous UTC date');
  });

  it('returns a stable zero-counter result for an empty work-item set', async () => {
    const deps = createDeps({ workItems: [] });

    const result = await runCrmForecastSnapshotSchedulerCore({ ...deps, ingress, now });

    expect(result).toMatchObject({
      failedWorkItems: 0,
      snapshotsInserted: 0,
      versionConflicts: 0,
      workItemsConsidered: 0,
      workItemsDeferred: 0,
      workItemsSucceeded: 0,
    });
  });

  it('counts deferred work when the work-item cap is hit', async () => {
    const deps = createDeps({ workItemsDeferred: 4 });

    const result = await runCrmForecastSnapshotSchedulerCore({
      ...deps,
      ingress,
      maxWorkItemsPerRun: 1,
      now,
    });

    expect(result.workItemsDeferred).toBe(4);
    expect(deps.workItemRepository.listWorkItems).toHaveBeenCalledWith({
      limit: 1,
      snapshotDateEndExclusive: new Date('2026-05-14T00:00:00.000Z'),
      snapshotDateStartInclusive: new Date('2025-04-09T00:00:00.000Z'),
    });
  });

  it('counts version conflicts without treating them as failed work items', async () => {
    const deps = createDeps({ insertResult: 'version_conflict' });

    const result = await runCrmForecastSnapshotSchedulerCore({ ...deps, ingress, now });

    expect(result).toMatchObject({
      failedWorkItems: 0,
      snapshotsInserted: 0,
      versionConflicts: 1,
      workItemsSucceeded: 0,
    });
    expect(getCrmForecastSnapshotSchedulerStatus(result)).toBe(200);
  });

  it('fails a work item closed when its tenant was not admitted for the run', async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const deps = createDeps({ workItems: [{ ...workItem, tenantId: 'tenant-unlisted' }] });

    const result = await runCrmForecastSnapshotSchedulerCore({ ...deps, ingress, logger, now });

    expect(result).toMatchObject({
      failedWorkItems: 1,
      snapshotsInserted: 0,
      workItemsSucceeded: 0,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      '[CRM Forecast Snapshot Scheduler] work item failed',
      expect.objectContaining({
        errorMessage: 'CRM forecast snapshot work item tenant was not admitted for this run',
        tenantId: 'tenant-unlisted',
      })
    );
    expect(deps.reportingRepository.listWeightedPipelineRows).not.toHaveBeenCalled();
    expect(deps.snapshotRepository.insertPipelineSnapshots).not.toHaveBeenCalled();
  });

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
