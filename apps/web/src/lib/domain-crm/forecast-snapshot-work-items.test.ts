import { describe, expect, it, vi } from 'vitest';

import {
  CRM_FORECAST_SNAPSHOT_MAX_WORK_ITEMS_PER_RUN,
  createCrmForecastSnapshotWorkItemRepository,
  mapWorkItemRows,
} from './forecast-snapshot-work-items';

type QueryCall = { args: unknown[]; method: string };
type WorkItemRow = {
  branchId: string | null;
  currencyCode: string | null;
  pipelineId: string | null;
  tenantId: string;
};

function row(overrides: Partial<WorkItemRow> = {}): WorkItemRow {
  return {
    branchId: 'branch-1',
    currencyCode: 'EUR',
    pipelineId: 'pipeline-1',
    tenantId: 'tenant-1',
    ...overrides,
  };
}

function createDatabaseDouble(results: WorkItemRow[][]) {
  const calls: QueryCall[] = [];
  const limitResults = [...results];
  const createChain = () => {
    const chain = {
      from: vi.fn((...args: unknown[]) => pushCall(chain, calls, 'from', args)),
      groupBy: vi.fn((...args: unknown[]) => pushCall(chain, calls, 'groupBy', args)),
      innerJoin: vi.fn((...args: unknown[]) => pushCall(chain, calls, 'innerJoin', args)),
      limit: vi.fn(async (...args: unknown[]) => {
        calls.push({ args, method: 'limit' });
        return limitResults.shift() ?? [];
      }),
      orderBy: vi.fn((...args: unknown[]) => pushCall(chain, calls, 'orderBy', args)),
      where: vi.fn((...args: unknown[]) => pushCall(chain, calls, 'where', args)),
    };
    return chain;
  };
  return { calls, database: { select: vi.fn(() => createChain()) } };
}

function pushCall<TChain>(
  chain: TChain,
  calls: QueryCall[],
  method: string,
  args: unknown[]
): TChain {
  calls.push({ args, method });
  return chain;
}

describe('crmForecastSnapshotWorkItemRepository', () => {
  it('maps bounded grouped rows and reports deferred work', () => {
    expect(
      mapWorkItemRows(
        [
          row({ branchId: null }),
          row({
            branchId: 'branch-2',
            currencyCode: 'USD',
            pipelineId: 'pipeline-2',
            tenantId: 'tenant-2',
          }),
          row({ branchId: 'branch-3', currencyCode: null, pipelineId: 'pipeline-3' }),
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
    const { calls, database } = createDatabaseDouble([[row()]]);

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
    expect(calls.filter(call => call.method === 'innerJoin')).toHaveLength(2);
    expect(calls.find(call => call.method === 'groupBy')?.args).toHaveLength(4);
    expect(calls.find(call => call.method === 'limit')?.args).toEqual([
      CRM_FORECAST_SNAPSHOT_MAX_WORK_ITEMS_PER_RUN + 1,
    ]);
  });

  it('fetches the true deferred work-item count when the first grouped query overflows', async () => {
    const firstRows = [
      row({ branchId: null }),
      row({
        branchId: 'branch-2',
        currencyCode: 'USD',
        pipelineId: 'pipeline-2',
        tenantId: 'tenant-2',
      }),
    ];
    const allRows = [
      ...firstRows,
      row({
        branchId: 'branch-3',
        currencyCode: 'GBP',
        pipelineId: 'pipeline-3',
        tenantId: 'tenant-3',
      }),
    ];
    const { calls, database } = createDatabaseDouble([firstRows, allRows]);

    const repository = createCrmForecastSnapshotWorkItemRepository(database as never);
    const result = await repository.listWorkItems({
      limit: 1,
      snapshotDateEndExclusive: new Date('2026-05-14T00:00:00.000Z'),
      snapshotDateStartInclusive: new Date('2025-04-09T00:00:00.000Z'),
    });

    expect(result.workItems).toEqual([
      {
        branchId: null,
        currencyCode: 'EUR',
        pipelineId: 'pipeline-1',
        tenantId: 'tenant-1',
      },
    ]);
    expect(result.workItemsDeferred).toBe(2);
    expect(database.select).toHaveBeenCalledTimes(2);
    expect(calls.filter(call => call.method === 'limit').map(call => call.args[0])).toEqual([
      2, 2_147_483_647,
    ]);
  });
});
