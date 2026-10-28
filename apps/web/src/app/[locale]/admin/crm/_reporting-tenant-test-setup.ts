import { beforeEach, vi } from 'vitest';

import type { CrmActorContext } from '@interdomestik/domain-crm/context';

const OWN_TENANT_ID = 'tenant-1';
const FOREIGN_TENANT_ID = 'tenant-2';
const NOW = '2026-05-14T12:00:00.000Z';

type FakeTransactionRecord = {
  id: number;
  status: 'aborted' | 'committed' | 'open' | 'rolled_back';
  tenantId: string;
};

const h = vi.hoisted(() => {
  const state = {
    failingOperations: new Set<string>(),
    nextTransactionId: 0,
    openContexts: new Set<number>(),
    reads: [] as Array<{ operation: string; tenantId: string; txId: number }>,
    resultsByTenant: new Map<string, Map<string, unknown>>(),
    transactions: [] as FakeTransactionRecord[],
  };

  function ambient(label: string, methods: readonly string[]): Record<string, () => never> {
    return Object.fromEntries(
      methods.map(method => [
        method,
        () => {
          throw new Error(`ambient ${label}.${method}() ran outside a tenant context`);
        },
      ])
    );
  }

  function read(tx: { id: number }, operation: string): unknown {
    const transaction = state.transactions.find(entry => entry.id === tx.id);
    if (!transaction || transaction.status !== 'open') {
      throw new Error(
        'current transaction is aborted, commands ignored until end of transaction block'
      );
    }
    state.reads.push({ operation, tenantId: transaction.tenantId, txId: transaction.id });
    if (state.failingOperations.has(operation)) {
      transaction.status = 'aborted';
      throw new Error('42703 column crm_deals.missing_column does not exist');
    }
    // Visibility follows the transaction tenant context, as RLS does on the restricted role.
    return state.resultsByTenant.get(transaction.tenantId)?.get(operation) ?? [];
  }

  async function withTenantContext<T>(
    context: { tenantId: string },
    action: (tx: { id: number }) => Promise<T>
  ): Promise<T> {
    state.nextTransactionId += 1;
    const transaction: FakeTransactionRecord = {
      id: state.nextTransactionId,
      status: 'open',
      tenantId: context.tenantId,
    };
    state.transactions.push(transaction);
    state.openContexts.add(transaction.id);
    try {
      const value = await action({ id: transaction.id });
      transaction.status = 'committed';
      return value;
    } catch (error) {
      transaction.status = 'rolled_back';
      throw error;
    } finally {
      // Transaction-local context: it cannot outlive the transaction.
      state.openContexts.delete(transaction.id);
    }
  }

  return { ambient, read, state, withTenantContext: vi.fn(withTenantContext) };
});

vi.mock('@interdomestik/database', () => ({ withTenantContext: h.withTenantContext }));

vi.mock('@/adapters/crm/reporting-repository', () => ({
  createCrmForecastSnapshotRepository: (tx: { id: number }) => ({
    listLatestPipelineSnapshots: async () => h.read(tx, 'listLatestPipelineSnapshots'),
  }),
  createCrmReportingRepository: (tx: { id: number }) => ({
    listAgentLeaderboardRows: async () => h.read(tx, 'listAgentLeaderboardRows'),
    listFunnelConversionRows: async () => h.read(tx, 'listFunnelConversionRows'),
    listSourceBreakdownRows: async () => h.read(tx, 'listSourceBreakdownRows'),
    listStageVelocityRows: async () => h.read(tx, 'listStageVelocityRows'),
    listWeightedPipelineRows: async () => h.read(tx, 'listWeightedPipelineRows'),
    listWinRateRows: async () => h.read(tx, 'listWinRateRows'),
  }),
  crmForecastSnapshotRepository: h.ambient('crmForecastSnapshotRepository', [
    'insertPipelineSnapshots',
    'listLatestPipelineSnapshots',
  ]),
  crmReportingRepository: h.ambient('crmReportingRepository', [
    'listSourceBreakdownRows',
    'listWeightedPipelineRows',
  ]),
}));

vi.mock('@/adapters/crm/forecast-snapshot-observability', () => ({
  createCrmForecastSnapshotObservabilityRepository: (tx: { id: number }) => ({
    listObservedSnapshots: async () => h.read(tx, 'listObservedSnapshots'),
  }),
  crmForecastSnapshotObservabilityRepository: h.ambient(
    'crmForecastSnapshotObservabilityRepository',
    ['listObservedSnapshots']
  ),
}));

vi.mock('@/adapters/crm/forecast-snapshot-work-items', () => ({
  CRM_FORECAST_SNAPSHOT_MAX_WORK_ITEMS_PER_RUN: 1000,
  createCrmForecastSnapshotWorkItemRepository: (tx: { id: number }) => ({
    listWorkItems: async () => h.read(tx, 'listWorkItems'),
  }),
  crmForecastSnapshotWorkItemRepository: h.ambient('crmForecastSnapshotWorkItemRepository', [
    'listWorkItems',
  ]),
}));

import { sourceBreakdownReportingRow, weightedReportingRow } from './_reporting-test-fixtures';

const adminActor: CrmActorContext = {
  actorId: 'admin-1',
  role: 'admin',
  scope: {},
  tenantId: OWN_TENANT_ID,
};

const foreignActor: CrmActorContext = { ...adminActor, tenantId: FOREIGN_TENANT_ID };

const EXPECTED_OPERATIONS = [
  'listLatestPipelineSnapshots',
  'listObservedSnapshots',
  'listSourceBreakdownRows',
  'listWeightedPipelineRows',
  'listWorkItems',
];

function tenantResults(tenantId: string): Map<string, unknown> {
  const owned = tenantId === OWN_TENANT_ID;
  return new Map<string, unknown>([
    [
      'listLatestPipelineSnapshots',
      owned
        ? [
            {
              branchId: null,
              closedLostAmountMinor: 1000,
              closedWonAmountMinor: 2000,
              createdAt: '2026-05-14T05:20:00.000Z',
              createdById: null,
              currencyCode: 'EUR',
              forecastBestAmountMinor: 0,
              forecastCommitAmountMinor: 8000,
              forecastOmittedAmountMinor: 0,
              forecastPipelineAmountMinor: 0,
              id: 'snapshot-1',
              idempotencyKey: null,
              openDealCount: 1,
              pipelineId: 'pipeline-1',
              rawValueAmountMinor: 10000,
              snapshotDate: '2026-05-13',
              snapshotVersion: 2,
              sourceRunId: 'run-1',
              tenantId: OWN_TENANT_ID,
              weightedValueAmountMinor: 8000,
            },
          ]
        : [],
    ],
    [
      'listObservedSnapshots',
      owned
        ? [
            {
              branchId: null,
              createdAt: '2026-05-14T05:20:00.000Z',
              currencyCode: 'EUR',
              pipelineId: 'pipeline-1',
              snapshotDate: '2026-05-13',
              snapshotVersion: 2,
              sourceRunId: 'run-1',
              tenantId: OWN_TENANT_ID,
            },
          ]
        : [],
    ],
    ['listSourceBreakdownRows', owned ? [sourceBreakdownReportingRow()] : []],
    ['listWeightedPipelineRows', owned ? [weightedReportingRow()] : []],
    [
      'listWorkItems',
      {
        workItems: owned
          ? [
              {
                branchId: null,
                currencyCode: 'EUR',
                pipelineId: 'pipeline-1',
                tenantId: OWN_TENANT_ID,
              },
            ]
          : [],
        workItemsDeferred: 0,
      },
    ],
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.failingOperations.clear();
  h.state.openContexts.clear();
  h.state.nextTransactionId = 0;
  h.state.reads.length = 0;
  h.state.transactions.length = 0;
  h.state.resultsByTenant.clear();
  h.state.resultsByTenant.set(OWN_TENANT_ID, tenantResults(OWN_TENANT_ID));
  h.state.resultsByTenant.set(FOREIGN_TENANT_ID, tenantResults(FOREIGN_TENANT_ID));
});

export { adminActor, foreignActor, h, EXPECTED_OPERATIONS, NOW, OWN_TENANT_ID, FOREIGN_TENANT_ID };
