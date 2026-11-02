import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_AUTHORITY, actor, createRepositories } from './_core.test-support';
import {
  ADMIN_CRM_FORECAST_OBSERVABILITY_MAX_COVERAGE_ROWS,
  ADMIN_CRM_REPORTING_SOURCE_TOP_N,
  AdminCrmReportingAccessDeniedError,
  createAdminCrmReportingWindow,
  deriveAdminCrmSnapshotFreshness,
  getAdminCrmReportingCore,
  getPreviousUtcSnapshotDate,
} from './_core';
import { sourceBreakdownReportingRow } from './_reporting-test-fixtures';

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
      { authority: TEST_AUTHORITY, actor },
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
      { authority: TEST_AUTHORITY, actor },
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
      { authority: TEST_AUTHORITY, actor },
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
        {
          authority: TEST_AUTHORITY,
          actor: { ...actor, role: 'branch_manager', scope: { branchId: 'branch-1' } },
        },
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
      { authority: TEST_AUTHORITY, actor },
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
});
