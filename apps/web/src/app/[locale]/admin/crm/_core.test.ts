import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type {
  CrmSourceBreakdownRow,
  CrmWeightedPipelineRow,
} from '@interdomestik/domain-crm/reporting';
import type {
  CrmForecastSnapshotRepository,
  CrmReportingRepository,
} from '@interdomestik/domain-crm/reporting/repository';

import {
  ADMIN_CRM_FORBIDDEN_PII_KEYS,
  ADMIN_CRM_REPORTING_SOURCE_TOP_N,
  AdminCrmReportingAccessDeniedError,
  createAdminCrmReportingWindow,
  deriveAdminCrmSnapshotFreshness,
  getAdminCrmReportingCore,
  getPreviousUtcSnapshotDate,
} from './_core';

const actor: CrmActorContext = {
  actorId: 'admin-1',
  role: 'admin',
  scope: {},
  tenantId: 'tenant-1',
};

function weightedRow(overrides: Partial<CrmWeightedPipelineRow> = {}): CrmWeightedPipelineRow {
  return {
    agentId: 'agent-1',
    branchId: 'branch-1',
    currencyCode: 'EUR',
    currentStageId: 'stage-open',
    dealId: overrides.dealId ?? 'deal-1',
    forecastCategory: 'commit',
    isLostStage: false,
    isWonStage: false,
    pipelineId: 'pipeline-1',
    source: 'website',
    stageProbability: 80,
    tenantId: 'tenant-1',
    valueAmountMinor: 10000,
    ...overrides,
  };
}

function sourceRow(overrides: Partial<CrmSourceBreakdownRow> = {}): CrmSourceBreakdownRow {
  return {
    ...weightedRow(overrides),
    outcome: 'open',
    ...overrides,
  };
}

function createRepositories() {
  const reportingRepository = {
    listAgentLeaderboardRows: vi.fn(),
    listFunnelConversionRows: vi.fn(),
    listSourceBreakdownRows: vi.fn(),
    listStageVelocityRows: vi.fn(),
    listWeightedPipelineRows: vi.fn(),
    listWinRateRows: vi.fn(),
  } satisfies CrmReportingRepository;
  const forecastSnapshotRepository = {
    insertPipelineSnapshots: vi.fn(),
    listLatestPipelineSnapshots: vi.fn(),
  } satisfies CrmForecastSnapshotRepository;

  reportingRepository.listWeightedPipelineRows.mockResolvedValue([weightedRow()]);
  reportingRepository.listSourceBreakdownRows.mockResolvedValue([sourceRow()]);
  forecastSnapshotRepository.listLatestPipelineSnapshots.mockResolvedValue([
    {
      branchId: null,
      closedLostAmountMinor: 1000,
      closedWonAmountMinor: 2000,
      createdAt: '2026-05-14T05:20:00.000Z',
      currencyCode: 'EUR',
      forecastBestAmountMinor: 0,
      forecastCommitAmountMinor: 8000,
      forecastOmittedAmountMinor: 0,
      forecastPipelineAmountMinor: 0,
      id: 'snapshot-1',
      openDealCount: 1,
      pipelineId: 'pipeline-1',
      rawValueAmountMinor: 10000,
      snapshotDate: '2026-05-13',
      snapshotVersion: 2,
      tenantId: 'tenant-1',
      weightedValueAmountMinor: 8000,
    },
  ]);

  return { forecastSnapshotRepository, reportingRepository };
}

describe('admin CRM reporting core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds the CRM14 dashboard from CRM05 repositories with frozen dates', async () => {
    const { forecastSnapshotRepository, reportingRepository } = createRepositories();
    const now = '2026-05-14T12:00:00.000Z';

    const dashboard = await getAdminCrmReportingCore(
      { actor },
      {
        forecastSnapshotRepository,
        now: () => now,
        reportingRepository,
      }
    );

    const window = createAdminCrmReportingWindow(now);
    expect(getPreviousUtcSnapshotDate(now)).toBe('2026-05-13');
    expect(reportingRepository.listWeightedPipelineRows).toHaveBeenCalledWith({ actor, window });
    expect(reportingRepository.listSourceBreakdownRows).toHaveBeenCalledWith({ actor, window });
    expect(forecastSnapshotRepository.listLatestPipelineSnapshots).toHaveBeenCalledWith({
      snapshotDate: '2026-05-13',
      tenantId: 'tenant-1',
    });
    expect(dashboard.snapshot).toMatchObject({
      state: 'data',
      rows: [
        {
          currencyCode: 'EUR',
          freshness: 'fresh',
          openDealCount: 1,
          snapshotVersion: 2,
          totalPipelineAmountMinor: 10000,
          weightedPipelineAmountMinor: 8000,
        },
      ],
    });
    expect(dashboard.branchPipeline).toMatchObject({
      state: 'data',
      rows: [
        {
          branchId: 'branch-1',
          currencyCode: 'EUR',
          openDealCount: 1,
          pipelineId: 'pipeline-1',
          totalPipelineAmountMinor: 10000,
          weightedPipelineAmountMinor: 8000,
        },
      ],
    });
  });

  it('caps and sorts source rows by deal count, source label, then currency', async () => {
    const { forecastSnapshotRepository, reportingRepository } = createRepositories();
    reportingRepository.listSourceBreakdownRows.mockResolvedValue([
      ...Array.from({ length: ADMIN_CRM_REPORTING_SOURCE_TOP_N + 3 }, (_, index) =>
        sourceRow({
          currencyCode: index % 2 === 0 ? 'EUR' : 'USD',
          dealId: `deal-${index}`,
          source: index === 0 ? 'beta' : `source-${String(index).padStart(2, '0')}`,
          valueAmountMinor: 1000,
        })
      ),
      sourceRow({ dealId: 'top', source: 'alpha', valueAmountMinor: 5000 }),
      sourceRow({ dealId: 'top-2', source: 'alpha', valueAmountMinor: 5000 }),
    ]);

    const dashboard = await getAdminCrmReportingCore(
      { actor },
      { forecastSnapshotRepository, now: () => '2026-05-14T12:00:00.000Z', reportingRepository }
    );

    expect(dashboard.sourceBreakdown.state).toBe('data');
    expect(dashboard.sourceBreakdown.rows).toHaveLength(ADMIN_CRM_REPORTING_SOURCE_TOP_N);
    expect(dashboard.sourceBreakdown.rows[0]).toMatchObject({
      dealCount: 2,
      sourceLabel: 'alpha',
    });
  });

  it('returns empty state when no previous-day snapshot rows exist', async () => {
    const { forecastSnapshotRepository, reportingRepository } = createRepositories();
    forecastSnapshotRepository.listLatestPipelineSnapshots.mockResolvedValue([]);

    const dashboard = await getAdminCrmReportingCore(
      { actor },
      { forecastSnapshotRepository, now: () => '2026-05-14T12:00:00.000Z', reportingRepository }
    );

    expect(dashboard.snapshot).toEqual({ excludedRowCount: 0, rows: [], state: 'empty' });
  });

  it('pins snapshot freshness thresholds', () => {
    expect(deriveAdminCrmSnapshotFreshness('2026-05-13', '2026-05-14T12:00:00.000Z')).toBe('fresh');
    expect(deriveAdminCrmSnapshotFreshness('2026-05-13', '2026-05-15T12:00:00.000Z')).toBe(
      'delayed'
    );
    expect(deriveAdminCrmSnapshotFreshness('2026-05-13', '2026-05-16T12:00:00.000Z')).toBe('stale');
    expect(deriveAdminCrmSnapshotFreshness(null, '2026-05-14T12:00:00.000Z')).toBe('missing');
  });

  it('fails closed for non-admin CRM actors before repository reads', async () => {
    const { forecastSnapshotRepository, reportingRepository } = createRepositories();

    await expect(
      getAdminCrmReportingCore(
        { actor: { ...actor, role: 'branch_manager', scope: { branchId: 'branch-1' } } },
        { forecastSnapshotRepository, reportingRepository }
      )
    ).rejects.toMatchObject({
      name: 'AdminCrmReportingAccessDeniedError',
      reason: 'role_scope',
    } satisfies Partial<AdminCrmReportingAccessDeniedError>);

    expect(reportingRepository.listWeightedPipelineRows).not.toHaveBeenCalled();
    expect(forecastSnapshotRepository.listLatestPipelineSnapshots).not.toHaveBeenCalled();
  });

  it('maps repository failures to a widget error without leaking raw failure text', async () => {
    const { forecastSnapshotRepository, reportingRepository } = createRepositories();
    const logger = { error: vi.fn() };
    reportingRepository.listSourceBreakdownRows.mockRejectedValueOnce(
      new Error('database details with sensitive context')
    );

    const dashboard = await getAdminCrmReportingCore(
      { actor },
      {
        forecastSnapshotRepository,
        logger,
        now: () => '2026-05-14T12:00:00.000Z',
        reportingRepository,
      }
    );

    expect(dashboard.sourceBreakdown).toEqual({
      excludedRowCount: 0,
      messageKey: 'error.generic',
      rows: [],
      state: 'error',
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it('keeps widget row shapes aggregate-only and PII-free', async () => {
    const { forecastSnapshotRepository, reportingRepository } = createRepositories();
    const dashboard = await getAdminCrmReportingCore(
      { actor },
      { forecastSnapshotRepository, now: () => '2026-05-14T12:00:00.000Z', reportingRepository }
    );

    const rowKeys = [
      ...Object.keys(dashboard.snapshot.rows[0] ?? {}),
      ...Object.keys(dashboard.branchPipeline.rows[0] ?? {}),
      ...Object.keys(dashboard.sourceBreakdown.rows[0] ?? {}),
    ];

    for (const forbiddenKey of ADMIN_CRM_FORBIDDEN_PII_KEYS) {
      expect(rowKeys).not.toContain(forbiddenKey);
    }
  });
});
