import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '@interdomestik/domain-crm/context';

import {
  ADMIN_CRM_FORECAST_OBSERVABILITY_MAX_COVERAGE_ROWS,
  ADMIN_CRM_FORBIDDEN_PII_KEYS,
  ADMIN_CRM_REPORTING_SOURCE_TOP_N,
  AdminCrmReportingAccessDeniedError,
  createAdminCrmReportingWindow,
  deriveAdminCrmForecastAlert,
  deriveAdminCrmForecastObservability,
  deriveAdminCrmSnapshotFreshness,
  getAdminCrmReportingCore,
  getPreviousUtcSnapshotDate,
} from './_core';
import {
  createCrmReportingRepositories,
  sourceBreakdownReportingRow,
  weightedReportingRow,
} from './_reporting-test-fixtures';

const actor: CrmActorContext = {
  actorId: 'admin-1',
  role: 'admin',
  scope: {},
  tenantId: 'tenant-1',
};

function createRepositories() {
  const { forecastSnapshotRepository, reportingRepository } = createCrmReportingRepositories();
  const forecastSnapshotObservabilityRepository = {
    listObservedSnapshots: vi.fn(),
  };
  const forecastSnapshotWorkItemRepository = {
    listWorkItems: vi.fn(),
  };

  reportingRepository.listWeightedPipelineRows.mockResolvedValue([weightedReportingRow()]);
  reportingRepository.listSourceBreakdownRows.mockResolvedValue([sourceBreakdownReportingRow()]);
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
  forecastSnapshotWorkItemRepository.listWorkItems.mockResolvedValue({
    workItems: [
      {
        branchId: null,
        currencyCode: 'EUR',
        pipelineId: 'pipeline-1',
        tenantId: 'tenant-1',
      },
    ],
    workItemsDeferred: 0,
  });
  forecastSnapshotObservabilityRepository.listObservedSnapshots.mockResolvedValue([
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

  return {
    forecastSnapshotObservabilityRepository,
    forecastSnapshotRepository,
    forecastSnapshotWorkItemRepository,
    reportingRepository,
  };
}

describe('admin CRM reporting core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds the CRM14 dashboard from CRM05 repositories with frozen dates', async () => {
    const repositories = createRepositories();
    const {
      forecastSnapshotObservabilityRepository,
      forecastSnapshotRepository,
      forecastSnapshotWorkItemRepository,
      reportingRepository,
    } = repositories;
    const now = '2026-05-14T12:00:00.000Z';

    const dashboard = await getAdminCrmReportingCore(
      { actor },
      {
        ...repositories,
        now: () => now,
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
    expect(forecastSnapshotWorkItemRepository.listWorkItems).toHaveBeenCalledWith({
      limit: ADMIN_CRM_FORECAST_OBSERVABILITY_MAX_COVERAGE_ROWS,
      snapshotDateEndExclusive: new Date('2026-05-14T00:00:00.000Z'),
      snapshotDateStartInclusive: new Date('2026-05-13T00:00:00.000Z'),
      tenantId: 'tenant-1',
    });
    expect(forecastSnapshotObservabilityRepository.listObservedSnapshots).toHaveBeenCalledWith({
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
    expect(dashboard.forecastObservability).toMatchObject({
      state: 'data',
      summary: {
        expectedWorkItems: 1,
        observedWorkItems: 1,
        latestSourceRunId: 'run-1',
      },
    });
    expect(dashboard.forecastAlert).toMatchObject({
      generatedAt: now,
      severity: 'ok',
      snapshotDate: '2026-05-13',
      metrics: {
        expectedWorkItems: 1,
        latestSnapshotCreatedAt: '2026-05-14T05:20:00.000Z',
        latestSourceRunId: 'run-1',
        observedWorkItems: 1,
      },
    });
  });

  it('caps and sorts source rows by deal count, source label, then currency', async () => {
    const repositories = createRepositories();
    const { reportingRepository } = repositories;
    reportingRepository.listSourceBreakdownRows.mockResolvedValue([
      ...Array.from({ length: ADMIN_CRM_REPORTING_SOURCE_TOP_N + 3 }, (_, index) =>
        sourceBreakdownReportingRow({
          currencyCode: index % 2 === 0 ? 'EUR' : 'USD',
          dealId: `deal-${index}`,
          source: index === 0 ? 'beta' : `source-${String(index).padStart(2, '0')}`,
          valueAmountMinor: 1000,
        })
      ),
      sourceBreakdownReportingRow({ dealId: 'top', source: 'alpha', valueAmountMinor: 5000 }),
      sourceBreakdownReportingRow({ dealId: 'top-2', source: 'alpha', valueAmountMinor: 5000 }),
    ]);

    const dashboard = await getAdminCrmReportingCore(
      { actor },
      { ...repositories, now: () => '2026-05-14T12:00:00.000Z' }
    );

    expect(dashboard.sourceBreakdown.state).toBe('data');
    expect(dashboard.sourceBreakdown.rows).toHaveLength(ADMIN_CRM_REPORTING_SOURCE_TOP_N);
    expect(dashboard.sourceBreakdown.rows[0]).toMatchObject({
      dealCount: 2,
      sourceLabel: 'alpha',
    });
  });

  it('returns empty state when no previous-day snapshot rows exist', async () => {
    const repositories = createRepositories();
    const { forecastSnapshotRepository } = repositories;
    forecastSnapshotRepository.listLatestPipelineSnapshots.mockResolvedValue([]);

    const dashboard = await getAdminCrmReportingCore(
      { actor },
      { ...repositories, now: () => '2026-05-14T12:00:00.000Z' }
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
    const repositories = createRepositories();
    const { forecastSnapshotRepository, reportingRepository } = repositories;

    await expect(
      getAdminCrmReportingCore(
        { actor: { ...actor, role: 'branch_manager', scope: { branchId: 'branch-1' } } },
        repositories
      )
    ).rejects.toMatchObject({
      name: 'AdminCrmReportingAccessDeniedError',
      reason: 'role_scope',
    } satisfies Partial<AdminCrmReportingAccessDeniedError>);

    expect(reportingRepository.listWeightedPipelineRows).not.toHaveBeenCalled();
    expect(forecastSnapshotRepository.listLatestPipelineSnapshots).not.toHaveBeenCalled();
  });

  it('maps repository failures to a widget error without leaking raw failure text', async () => {
    const repositories = createRepositories();
    const { reportingRepository } = repositories;
    const logger = { error: vi.fn() };
    reportingRepository.listSourceBreakdownRows.mockRejectedValueOnce(
      new Error('database details with sensitive context')
    );

    const dashboard = await getAdminCrmReportingCore(
      { actor },
      {
        ...repositories,
        logger,
        now: () => '2026-05-14T12:00:00.000Z',
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

  it('derives forecast observability statuses, unexpected counts, and latest run deterministically', () => {
    const widget = deriveAdminCrmForecastObservability({
      expectedWorkItems: [
        {
          branchId: null,
          currencyCode: 'EUR',
          pipelineId: 'pipeline-missing',
          tenantId: 'tenant-1',
        },
        {
          branchId: 'branch-delayed',
          currencyCode: 'EUR',
          pipelineId: 'pipeline-delayed',
          tenantId: 'tenant-1',
        },
        {
          branchId: 'branch-stale',
          currencyCode: 'USD',
          pipelineId: 'pipeline-stale',
          tenantId: 'tenant-1',
        },
        {
          branchId: 'branch-fresh',
          currencyCode: 'GBP',
          pipelineId: 'pipeline-fresh',
          tenantId: 'tenant-1',
        },
      ],
      expectedWorkItemsDeferred: 2,
      generatedAt: '2026-05-14T12:00:00.000Z',
      noBranchLabel: 'No branch',
      observedSnapshots: [
        {
          branchId: 'branch-delayed',
          createdAt: '2026-05-13T06:00:00.000Z',
          currencyCode: 'EUR',
          pipelineId: 'pipeline-delayed',
          snapshotDate: '2026-05-13',
          snapshotVersion: 2,
          sourceRunId: 'run-delayed',
          tenantId: 'tenant-1',
        },
        {
          branchId: 'branch-stale',
          createdAt: '2026-05-12T12:00:00.000Z',
          currencyCode: 'USD',
          pipelineId: 'pipeline-stale',
          snapshotDate: '2026-05-13',
          snapshotVersion: 10,
          sourceRunId: 'run-stale',
          tenantId: 'tenant-1',
        },
        {
          branchId: 'branch-fresh',
          createdAt: '2026-05-14T11:00:00.000Z',
          currencyCode: 'GBP',
          pipelineId: 'pipeline-fresh',
          snapshotDate: '2026-05-13',
          snapshotVersion: 1,
          sourceRunId: 'run-z',
          tenantId: 'tenant-1',
        },
        {
          branchId: 'branch-unexpected',
          createdAt: '2026-05-14T10:00:00.000Z',
          currencyCode: 'EUR',
          pipelineId: 'pipeline-unexpected',
          snapshotDate: '2026-05-13',
          snapshotVersion: 1,
          sourceRunId: 'run-a',
          tenantId: 'tenant-1',
        },
        {
          branchId: 'branch-unexpected',
          createdAt: '2026-05-14T11:00:00.000Z',
          currencyCode: 'EUR',
          pipelineId: 'pipeline-unexpected',
          snapshotDate: '2026-05-13',
          snapshotVersion: 2,
          sourceRunId: 'run-a',
          tenantId: 'tenant-1',
        },
      ],
      snapshotDate: '2026-05-13',
    });

    if (widget.state !== 'data') {
      throw new Error('expected data forecast observability widget');
    }
    expect(widget.summary).toMatchObject({
      delayedWorkItems: 1,
      expectedWorkItems: 4,
      expectedWorkItemsDeferred: 2,
      latestSnapshotCreatedAt: '2026-05-14T11:00:00.000Z',
      latestSourceRunId: 'run-a',
      missingWorkItems: 1,
      observedWorkItems: 4,
      staleWorkItems: 1,
      unexpectedObservedWorkItems: 1,
    });
    expect(widget.coverageRows.map(row => row.status)).toEqual([
      'missing',
      'stale',
      'delayed',
      'fresh',
    ]);
    expect(widget.coverageRows[0]).toMatchObject({
      branchLabel: 'No branch',
      latestSnapshotCreatedAt: null,
      snapshotVersion: null,
      sourceRunId: null,
    });
    expect(widget.coverageRows.find(row => row.pipelineId === 'pipeline-stale')).toMatchObject({
      snapshotVersion: 10,
      status: 'stale',
    });
  });

  it('derives forecast alert severity with critical precedence over warnings', () => {
    const alert = deriveAdminCrmForecastAlert({
      batchRows: [],
      coverageRows: [],
      hiddenCoverageRowCount: 0,
      state: 'data',
      summary: {
        delayedWorkItems: 1,
        expectedWorkItems: 4,
        expectedWorkItemsDeferred: 1,
        generatedAt: '2026-05-14T12:00:00.000Z',
        latestSnapshotCreatedAt: '2026-05-12T12:00:00.000Z',
        latestSourceRunId: 'run-1',
        missingWorkItems: 1,
        observedWorkItems: 3,
        snapshotDate: '2026-05-13',
        staleWorkItems: 1,
        unexpectedObservedWorkItems: 1,
      },
    });

    expect(alert).toMatchObject({
      explanationMessageKey: 'forecastAlert.critical.explanation',
      generatedAt: '2026-05-14T12:00:00.000Z',
      headlineMessageKey: 'forecastAlert.critical.headline',
      metrics: {
        latestSnapshotCreatedAt: '2026-05-12T12:00:00.000Z',
        latestSourceRunId: 'run-1',
      },
      severity: 'critical',
      snapshotDate: '2026-05-13',
    });
  });

  it('derives warning, ok, and unknown forecast alert states', () => {
    const baseSummary = {
      delayedWorkItems: 0,
      expectedWorkItems: 2,
      expectedWorkItemsDeferred: 0,
      generatedAt: '2026-05-14T12:00:00.000Z',
      latestSnapshotCreatedAt: '2026-05-14T05:20:00.000Z',
      latestSourceRunId: 'run-1',
      missingWorkItems: 0,
      observedWorkItems: 2,
      snapshotDate: '2026-05-13',
      staleWorkItems: 0,
      unexpectedObservedWorkItems: 0,
    };

    expect(
      deriveAdminCrmForecastAlert({
        batchRows: [],
        coverageRows: [],
        hiddenCoverageRowCount: 0,
        state: 'data',
        summary: { ...baseSummary, expectedWorkItemsDeferred: 1 },
      }).severity
    ).toBe('warning');
    expect(
      deriveAdminCrmForecastAlert({
        batchRows: [],
        coverageRows: [],
        hiddenCoverageRowCount: 0,
        state: 'data',
        summary: baseSummary,
      }).severity
    ).toBe('ok');
    expect(
      deriveAdminCrmForecastAlert({
        batchRows: [],
        coverageRows: [],
        hiddenCoverageRowCount: 0,
        state: 'empty',
        summary: { ...baseSummary, expectedWorkItems: 0, observedWorkItems: 0 },
      })
    ).toMatchObject({
      generatedAt: baseSummary.generatedAt,
      metrics: {
        latestSnapshotCreatedAt: baseSummary.latestSnapshotCreatedAt,
        latestSourceRunId: baseSummary.latestSourceRunId,
      },
      severity: 'unknown',
      snapshotDate: baseSummary.snapshotDate,
    });
    expect(
      deriveAdminCrmForecastAlert({
        batchRows: [],
        coverageRows: [],
        hiddenCoverageRowCount: 0,
        messageKey: 'error.generic',
        state: 'error',
        summary: null,
      })
    ).toMatchObject({
      generatedAt: null,
      metrics: {
        latestSnapshotCreatedAt: null,
        latestSourceRunId: null,
      },
      severity: 'unknown',
      snapshotDate: null,
    });
  });

  it('keeps widget row shapes aggregate-only and PII-free', async () => {
    const repositories = createRepositories();
    const dashboard = await getAdminCrmReportingCore(
      { actor },
      { ...repositories, now: () => '2026-05-14T12:00:00.000Z' }
    );

    const rowKeys = [
      ...Object.keys(dashboard.snapshot.rows[0] ?? {}),
      ...Object.keys(dashboard.branchPipeline.rows[0] ?? {}),
      ...Object.keys(dashboard.sourceBreakdown.rows[0] ?? {}),
      ...Object.keys(dashboard.forecastObservability.summary ?? {}),
      ...Object.keys(dashboard.forecastObservability.coverageRows[0] ?? {}),
      ...Object.keys(dashboard.forecastObservability.batchRows[0] ?? {}),
      ...Object.keys(dashboard.forecastAlert),
      ...Object.keys(dashboard.forecastAlert.metrics),
    ];

    for (const forbiddenKey of ADMIN_CRM_FORBIDDEN_PII_KEYS) {
      expect(rowKeys).not.toContain(forbiddenKey);
    }
  });
});
