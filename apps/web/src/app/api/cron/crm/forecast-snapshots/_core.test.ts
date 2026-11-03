import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeps, ingress, now, scheduleTenants, workItem } from './_core.test-support';
import {
  getCrmForecastSnapshotSchedulerStatus,
  runCrmForecastSnapshotSchedulerCore,
} from './_core';

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
});
