import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const withTenantContext = vi.hoisted(() =>
  vi.fn<(context: unknown, action: (tx: unknown) => Promise<unknown>) => Promise<unknown>>()
);

vi.mock('@interdomestik/database', () => ({
  withTenantContext,
}));

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

function authoritiesFor(...tenantIds: string[]) {
  return tenantIds.map(tenantId => mintTestTenantAuthority(tenantId));
}

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

    const repository = createCrmForecastSnapshotWorkItemRepository(
      authoritiesFor('tenant-1'),
      database as never
    );
    const result = await repository.listWorkItems({
      snapshotDateEndExclusive: new Date('2026-05-14T00:00:00.000Z'),
      snapshotDateStartInclusive: new Date('2025-04-09T00:00:00.000Z'),
      tenantId: 'tenant-1',
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
    expect(calls.find(call => call.method === 'where')?.args).toHaveLength(1);
    expect(calls.find(call => call.method === 'groupBy')?.args).toHaveLength(4);
    expect(calls.find(call => call.method === 'limit')?.args).toEqual([
      CRM_FORECAST_SNAPSHOT_MAX_WORK_ITEMS_PER_RUN + 1,
    ]);
  });

  describe('scheduler path (several authorities, no tenantId)', () => {
    const window = {
      snapshotDateEndExclusive: new Date('2026-05-14T00:00:00.000Z'),
      snapshotDateStartInclusive: new Date('2025-04-09T00:00:00.000Z'),
    };

    function compiledWhere(args: unknown[]) {
      return new PgDialect().sqlToQuery(args[0] as Parameters<PgDialect['sqlToQuery']>[0]);
    }

    beforeEach(() => {
      withTenantContext.mockReset();
    });

    it('fetches the true deferred work-item count when the first grouped query overflows', async () => {
      const tenant1 = row({ branchId: null });
      const tenant2 = row({
        branchId: 'branch-2',
        currencyCode: 'USD',
        pipelineId: 'pipeline-2',
        tenantId: 'tenant-2',
      });
      const tenant3 = row({
        branchId: 'branch-3',
        currencyCode: 'GBP',
        pipelineId: 'pipeline-3',
        tenantId: 'tenant-3',
      });
      // First pass (budget 2): tenant-1 -> 1 row, tenant-2 -> 1 row, tenant-3 never visited.
      // Second pass (huge budget): every tenant is visited.
      const { calls, database } = createDatabaseDouble([
        [tenant1],
        [tenant2],
        [tenant1],
        [tenant2],
        [tenant3],
      ]);

      const repository = createCrmForecastSnapshotWorkItemRepository(
        authoritiesFor('tenant-1', 'tenant-2', 'tenant-3'),
        database as never
      );
      const result = await repository.listWorkItems({ limit: 1, ...window });

      expect(result.workItems).toEqual([
        {
          branchId: null,
          currencyCode: 'EUR',
          pipelineId: 'pipeline-1',
          tenantId: 'tenant-1',
        },
      ]);
      expect(result.workItemsDeferred).toBe(2);
      expect(database.select).toHaveBeenCalledTimes(5);
      expect(calls.filter(call => call.method === 'limit').map(call => call.args[0])).toEqual([
        2, 1, 2_147_483_647, 2_147_483_646, 2_147_483_645,
      ]);
    });

    it('visits tenants in the supplied order with a shared budget and stops once it is spent', async () => {
      const a1 = row({ pipelineId: 'pipeline-1', tenantId: 'tenant-a' });
      const a2 = row({ pipelineId: 'pipeline-2', tenantId: 'tenant-a' });
      const a3 = row({ pipelineId: 'pipeline-3', tenantId: 'tenant-a' });
      const b1 = row({ tenantId: 'tenant-b' });
      // First pass (budget 3): tenant-a spends it all, so b and c are never visited.
      // Deferred-count pass: a (3 rows), b (1 row), c (0 rows) are all visited in order.
      const { calls, database } = createDatabaseDouble([[a1, a2, a3], [a1, a2, a3], [b1], []]);

      const repository = createCrmForecastSnapshotWorkItemRepository(
        authoritiesFor('tenant-a', 'tenant-b', 'tenant-c'),
        database as never
      );
      const result = await repository.listWorkItems({ limit: 2, ...window });

      const huge = 2_147_483_647;
      expect(calls.filter(call => call.method === 'limit').map(call => call.args[0])).toEqual([
        3,
        huge,
        huge - 3,
        huge - 4,
      ]);
      expect(database.select).toHaveBeenCalledTimes(4);
      expect(result.workItems.map(item => item.pipelineId)).toEqual(['pipeline-1', 'pipeline-2']);
      expect(result.workItemsDeferred).toBe(2);
    });

    it('carries each visited tenant predicate into its own grouped query', async () => {
      const { calls, database } = createDatabaseDouble([
        [row({ tenantId: 'tenant-a' })],
        [row({ tenantId: 'tenant-b' })],
      ]);

      const repository = createCrmForecastSnapshotWorkItemRepository(
        authoritiesFor('tenant-a', 'tenant-b'),
        database as never
      );
      const result = await repository.listWorkItems(window);

      const wheres = calls
        .filter(call => call.method === 'where')
        .map(call => compiledWhere(call.args));
      expect(wheres).toHaveLength(2);
      for (const [index, tenantId] of ['tenant-a', 'tenant-b'].entries()) {
        expect(wheres[index].sql).toContain('"crm_deals"."tenant_id" = $1');
        expect(wheres[index].params[0]).toBe(tenantId);
        expect(wheres[index].params).not.toContain(
          tenantId === 'tenant-a' ? 'tenant-b' : 'tenant-a'
        );
      }
      expect(result.workItems.map(item => item.tenantId)).toEqual(['tenant-a', 'tenant-b']);
      expect(result.workItemsDeferred).toBe(0);
    });

    it('lets a tenantId filter only narrow the authorities it was given', async () => {
      const { calls, database } = createDatabaseDouble([[row({ tenantId: 'tenant-9' })]]);

      const repository = createCrmForecastSnapshotWorkItemRepository(
        authoritiesFor('tenant-1', 'tenant-9'),
        database as never
      );
      await repository.listWorkItems({ tenantId: 'tenant-9', ...window });

      expect(database.select).toHaveBeenCalledTimes(1);
      const where = compiledWhere(calls.find(call => call.method === 'where')?.args ?? []);
      expect(where.params[0]).toBe('tenant-9');
    });

    it('returns no work and runs no query for a tenantId without a supplied authority', async () => {
      const { database } = createDatabaseDouble([[row({ tenantId: 'tenant-2' })]]);

      const repository = createCrmForecastSnapshotWorkItemRepository(
        authoritiesFor('tenant-1'),
        database as never
      );
      await expect(repository.listWorkItems({ tenantId: 'tenant-2', ...window })).resolves.toEqual({
        workItems: [],
        workItemsDeferred: 0,
      });
      expect(database.select).not.toHaveBeenCalled();
      expect(withTenantContext).not.toHaveBeenCalled();
    });

    it('returns no work items when there are no authorities', async () => {
      const { database } = createDatabaseDouble([]);

      const repository = createCrmForecastSnapshotWorkItemRepository([], database as never);
      await expect(repository.listWorkItems(window)).resolves.toEqual({
        workItems: [],
        workItemsDeferred: 0,
      });
      expect(database.select).not.toHaveBeenCalled();
    });

    it('opens each tenant query through withTenantAuthority with that exact authority when no executor is injected', async () => {
      const [authorityA, authorityB] = authoritiesFor('tenant-a', 'tenant-b');
      const { database } = createDatabaseDouble([
        [row({ tenantId: 'tenant-a' })],
        [row({ tenantId: 'tenant-b' })],
      ]);
      withTenantContext.mockImplementation(async (_context, action) => action(database));

      const repository = createCrmForecastSnapshotWorkItemRepository([authorityA, authorityB]);
      const result = await repository.listWorkItems(window);

      expect(withTenantContext).toHaveBeenCalledTimes(2);
      expect(withTenantContext.mock.calls[0][0]).toBe(authorityA);
      expect(withTenantContext.mock.calls[1][0]).toBe(authorityB);
      expect(result.workItems.map(item => item.tenantId)).toEqual(['tenant-a', 'tenant-b']);
    });
  });
});
