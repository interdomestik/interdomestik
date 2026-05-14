import { describe, expect, it, vi } from 'vitest';

import {
  CRM_FORECAST_SNAPSHOT_MAX_WORK_ITEMS_PER_RUN,
  createCrmForecastSnapshotWorkItemRepository,
  mapWorkItemRows,
} from './forecast-snapshot-work-items';

describe('crmForecastSnapshotWorkItemRepository', () => {
  it('maps bounded grouped rows and reports deferred work', () => {
    expect(
      mapWorkItemRows(
        [
          {
            branchId: null,
            currencyCode: 'EUR',
            pipelineId: 'pipeline-1',
            tenantId: 'tenant-1',
          },
          {
            branchId: 'branch-2',
            currencyCode: 'USD',
            pipelineId: 'pipeline-2',
            tenantId: 'tenant-2',
          },
          {
            branchId: 'branch-3',
            currencyCode: null,
            pipelineId: 'pipeline-3',
            tenantId: 'tenant-3',
          },
        ],
        2
      )
    ).toEqual({
      workItems: [
        {
          branchId: null,
          currencyCode: 'EUR',
          pipelineId: 'pipeline-1',
          tenantId: 'tenant-1',
        },
        {
          branchId: 'branch-2',
          currencyCode: 'USD',
          pipelineId: 'pipeline-2',
          tenantId: 'tenant-2',
        },
      ],
      workItemsDeferred: 1,
    });
  });

  it('uses a grouped normalized-deal query with the exported work-item cap', async () => {
    const calls: { args: unknown[]; method: string }[] = [];
    const chain = {
      from: vi.fn((...args: unknown[]) => {
        calls.push({ args, method: 'from' });
        return chain;
      }),
      groupBy: vi.fn((...args: unknown[]) => {
        calls.push({ args, method: 'groupBy' });
        return chain;
      }),
      innerJoin: vi.fn((...args: unknown[]) => {
        calls.push({ args, method: 'innerJoin' });
        return chain;
      }),
      limit: vi.fn(async (...args: unknown[]) => {
        calls.push({ args, method: 'limit' });
        return [
          {
            branchId: 'branch-1',
            currencyCode: 'EUR',
            pipelineId: 'pipeline-1',
            tenantId: 'tenant-1',
          },
        ];
      }),
      orderBy: vi.fn((...args: unknown[]) => {
        calls.push({ args, method: 'orderBy' });
        return chain;
      }),
      where: vi.fn((...args: unknown[]) => {
        calls.push({ args, method: 'where' });
        return chain;
      }),
    };
    const database = { select: vi.fn(() => chain) };

    const repository = createCrmForecastSnapshotWorkItemRepository(database as never);
    const result = await repository.listWorkItems({
      snapshotDateEndExclusive: new Date('2026-05-14T00:00:00.000Z'),
      snapshotDateStartInclusive: new Date('2025-04-09T00:00:00.000Z'),
    });

    expect(result.workItems).toEqual([
      {
        branchId: 'branch-1',
        currencyCode: 'EUR',
        pipelineId: 'pipeline-1',
        tenantId: 'tenant-1',
      },
    ]);
    expect(chain.innerJoin).toHaveBeenCalledTimes(2);
    expect(calls.find(call => call.method === 'groupBy')?.args).toHaveLength(4);
    expect(calls.find(call => call.method === 'limit')?.args).toEqual([
      CRM_FORECAST_SNAPSHOT_MAX_WORK_ITEMS_PER_RUN + 1,
    ]);
  });
});
