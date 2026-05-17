import { describe, expect, it, vi } from 'vitest';

import { createCrmForecastSnapshotObservabilityRepository } from './forecast-snapshot-observability';

type QueryCall = { args: unknown[]; method: string };
type ObservedSnapshotRow = {
  branchId: string | null;
  createdAt: Date;
  currencyCode: string;
  pipelineId: string;
  snapshotDate: string;
  snapshotVersion: number;
  sourceRunId: string | null;
  tenantId: string;
};

function createDatabaseDouble(rows: ObservedSnapshotRow[]) {
  const calls: QueryCall[] = [];
  const chain = {
    from: vi.fn((...args: unknown[]) => pushCall(chain, calls, 'from', args)),
    orderBy: vi.fn(async (...args: unknown[]) => {
      calls.push({ args, method: 'orderBy' });
      return rows;
    }),
    where: vi.fn((...args: unknown[]) => pushCall(chain, calls, 'where', args)),
  };
  return { calls, database: { select: vi.fn(() => chain) } };
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

describe('crmForecastSnapshotObservabilityRepository', () => {
  it('reads tenant-scoped observed snapshot rows for one frozen snapshot date', async () => {
    const { calls, database } = createDatabaseDouble([
      {
        branchId: null,
        createdAt: new Date('2026-05-14T05:20:00.000Z'),
        currencyCode: 'EUR',
        pipelineId: 'pipeline-1',
        snapshotDate: '2026-05-13',
        snapshotVersion: 2,
        sourceRunId: 'run-1',
        tenantId: 'tenant-1',
      },
    ]);
    const repository = createCrmForecastSnapshotObservabilityRepository(database as never);

    await expect(
      repository.listObservedSnapshots({
        snapshotDate: '2026-05-13',
        tenantId: 'tenant-1',
      })
    ).resolves.toEqual([
      {
        branchId: null,
        createdAt: '2026-05-14T05:20:00.000Z',
        currencyCode: 'EUR',
        pipelineId: 'pipeline-1',
        snapshotDate: '2026-05-13',
        snapshotVersion: 2,
        sourceRunId: 'run-1',
        tenantId: 'tenant-1',
      },
    ]);
    expect(database.select).toHaveBeenCalledTimes(1);
    expect(calls.map(call => call.method)).toEqual(['from', 'where', 'orderBy']);
    expect(calls.find(call => call.method === 'where')?.args).toHaveLength(1);
  });
});
