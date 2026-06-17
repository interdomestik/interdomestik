import { describe, expect, it, vi } from 'vitest';

import type { CrmForecastSnapshotWorkItem } from '@/adapters/crm/forecast-snapshot-work-items';

import {
  createCrmForecastSnapshotTestDeps,
  createCrmForecastSnapshotWeightedRow,
} from '../_core.test-helpers';
import { runCrmForecastSnapshotBackfillCore } from './_core';

const now = new Date('2026-05-15T10:30:00.000Z');

function item(index: number): CrmForecastSnapshotWorkItem {
  return {
    branchId: `branch-${index}`,
    currencyCode: 'EUR',
    pipelineId: `pipeline-${index}`,
    tenantId: `tenant-${index}`,
  };
}

function rowsFor(items: readonly CrmForecastSnapshotWorkItem[]) {
  return new Map(
    items.map(workItem => [
      workItem.tenantId,
      createCrmForecastSnapshotWeightedRow({
        branchId: workItem.branchId,
        pipelineId: workItem.pipelineId,
        tenantId: workItem.tenantId,
      }),
    ])
  );
}

describe('runCrmForecastSnapshotBackfillCore concurrency', () => {
  it('bounds per-date work-item concurrency while preserving aggregate rollups and idempotency', async () => {
    const workItems = [item(1), item(2), item(3), item(4), item(5)];
    const rowsByTenant = rowsFor(workItems);
    const deps = createCrmForecastSnapshotTestDeps({ rows: [], workItems });
    let active = 0;
    let maxActive = 0;

    deps.reportingRepository.listWeightedPipelineRows.mockImplementation(async input => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return [rowsByTenant.get(input.actor.tenantId)!];
    });

    const result = await runCrmForecastSnapshotBackfillCore({
      ...deps,
      fromDate: '2026-05-14',
      now,
      sourceRunId: 'run-1',
      tenantId: 'tenant-1',
      toDate: '2026-05-14',
    });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(result).toMatchObject({
      failedWorkItems: 0,
      snapshotsInserted: 5,
      workItemsConsidered: 5,
      workItemsDeferred: 0,
      workItemsSucceeded: 5,
    });
    const insertCalls = deps.snapshotRepository.insertPipelineSnapshots.mock.calls as Array<
      [{ snapshots: { idempotencyKey: string }[] }]
    >;
    const keys = insertCalls.flatMap(([params]) =>
      params.snapshots.map(snapshot => snapshot.idempotencyKey)
    );
    expect(keys).toContain(
      'crm-forecast-snapshot-backfill:tenant-3:pipeline-3:branch-3:EUR:2026-05-14:run-1'
    );
  });

  it('rolls up failures without hiding completed concurrent work items', async () => {
    const workItems = [item(1), item(2), item(3)];
    const rowsByTenant = rowsFor(workItems);
    const deps = createCrmForecastSnapshotTestDeps({ rows: [], workItems });
    deps.reportingRepository.listWeightedPipelineRows.mockImplementation(async input => {
      if (input.actor.tenantId === 'tenant-2') throw new Error('db down');
      return [rowsByTenant.get(input.actor.tenantId)!];
    });

    const result = await runCrmForecastSnapshotBackfillCore({
      ...deps,
      fromDate: '2026-05-14',
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      now,
      tenantId: 'tenant-1',
      toDate: '2026-05-14',
    });

    expect(result.dateResults[0]).toMatchObject({
      failedWorkItems: 1,
      snapshotsInserted: 2,
      status: 'partial',
      workItemsSucceeded: 2,
    });
  });

  it('keeps dates sequential while allowing bounded work-item concurrency within a date', async () => {
    const deps = createCrmForecastSnapshotTestDeps({ workItems: [item(1)] });
    let resolveFirstRows: (rows: ReturnType<typeof createCrmForecastSnapshotWeightedRow>[]) => void;
    const firstRows = new Promise<ReturnType<typeof createCrmForecastSnapshotWeightedRow>[]>(
      resolve => {
        resolveFirstRows = resolve;
      }
    );
    deps.reportingRepository.listWeightedPipelineRows
      .mockReturnValueOnce(firstRows)
      .mockResolvedValueOnce([createCrmForecastSnapshotWeightedRow(item(1))]);

    const pending = runCrmForecastSnapshotBackfillCore({
      ...deps,
      fromDate: '2026-05-13',
      now,
      tenantId: 'tenant-1',
      toDate: '2026-05-14',
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(deps.workItemRepository.listWorkItems).toHaveBeenCalledTimes(1);
    resolveFirstRows!([createCrmForecastSnapshotWeightedRow(item(1))]);
    await expect(pending).resolves.toMatchObject({ datesConsidered: 2 });
    expect(deps.workItemRepository.listWorkItems).toHaveBeenCalledTimes(2);
  });
});
