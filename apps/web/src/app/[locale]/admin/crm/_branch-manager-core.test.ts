import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '@interdomestik/domain-crm/context';

import {
  BRANCH_MANAGER_CRM_FORBIDDEN_PII_KEYS,
  BRANCH_MANAGER_CRM_REPORTING_SOURCE_TOP_N,
  BranchManagerCrmReportingAccessDeniedError,
  createBranchManagerCrmReportingWindow,
  deriveBranchManagerCrmSnapshotFreshness,
  getBranchManagerCrmReportingCore,
} from './_branch-manager-core';
import {
  createCrmReportingRepositories,
  sourceBreakdownReportingRow,
  weightedReportingRow,
} from './_reporting-test-fixtures';

const actor: CrmActorContext = {
  actorId: 'manager-1',
  role: 'branch_manager',
  scope: { branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

function createRepositories() {
  const { forecastSnapshotRepository, reportingRepository } = createCrmReportingRepositories();

  reportingRepository.listWeightedPipelineRows.mockResolvedValue([
    weightedReportingRow(),
    weightedReportingRow({ branchId: 'branch-2', dealId: 'other-branch' }),
  ]);
  reportingRepository.listSourceBreakdownRows.mockResolvedValue([
    sourceBreakdownReportingRow(),
    sourceBreakdownReportingRow({ branchId: 'branch-2', dealId: 'other-source' }),
  ]);
  forecastSnapshotRepository.listLatestPipelineSnapshots.mockResolvedValue([
    {
      branchId: 'branch-1',
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
    {
      branchId: null,
      closedLostAmountMinor: 9000,
      closedWonAmountMinor: 9000,
      createdAt: '2026-05-14T05:20:00.000Z',
      currencyCode: 'EUR',
      forecastBestAmountMinor: 0,
      forecastCommitAmountMinor: 9000,
      forecastOmittedAmountMinor: 0,
      forecastPipelineAmountMinor: 0,
      id: 'tenant-snapshot',
      openDealCount: 9,
      pipelineId: 'pipeline-tenant',
      rawValueAmountMinor: 90000,
      snapshotDate: '2026-05-13',
      snapshotVersion: 1,
      tenantId: 'tenant-1',
      weightedValueAmountMinor: 9000,
    },
  ]);

  return { forecastSnapshotRepository, reportingRepository };
}

describe('branch-manager CRM reporting core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a branch-scoped dashboard with one frozen reporting window', async () => {
    const { forecastSnapshotRepository, reportingRepository } = createRepositories();
    const now = '2026-05-14T12:00:00.000Z';

    const dashboard = await getBranchManagerCrmReportingCore(
      { actor },
      {
        branchLabel: 'Prishtina',
        forecastSnapshotRepository,
        now: () => now,
        reportingRepository,
      }
    );

    const window = createBranchManagerCrmReportingWindow(now);
    expect(reportingRepository.listWeightedPipelineRows).toHaveBeenCalledWith({ actor, window });
    expect(reportingRepository.listSourceBreakdownRows).toHaveBeenCalledWith({ actor, window });
    expect(forecastSnapshotRepository.listLatestPipelineSnapshots).toHaveBeenCalledWith({
      branchId: 'branch-1',
      snapshotDate: '2026-05-13',
      tenantId: 'tenant-1',
    });
    expect(dashboard.window).toEqual(window);
    expect(dashboard.branchPipeline.rows).toEqual([
      expect.objectContaining({
        branchId: 'branch-1',
        branchLabel: 'Prishtina',
        pipelineId: 'pipeline-1',
      }),
    ]);
    expect(dashboard.snapshot.rows).toEqual([
      expect.objectContaining({
        branchId: 'branch-1',
        branchLabel: 'Prishtina',
        pipelineId: 'pipeline-1',
      }),
    ]);
  });

  it('renders empty branch snapshot instead of falling back to tenant-wide snapshot rows', async () => {
    const { forecastSnapshotRepository, reportingRepository } = createRepositories();
    forecastSnapshotRepository.listLatestPipelineSnapshots.mockResolvedValue([
      {
        branchId: null,
        closedLostAmountMinor: 0,
        closedWonAmountMinor: 0,
        createdAt: '2026-05-14T05:20:00.000Z',
        currencyCode: 'EUR',
        forecastBestAmountMinor: 0,
        forecastCommitAmountMinor: 8000,
        forecastOmittedAmountMinor: 0,
        forecastPipelineAmountMinor: 0,
        id: 'tenant-snapshot',
        openDealCount: 1,
        pipelineId: 'pipeline-1',
        rawValueAmountMinor: 10000,
        snapshotDate: '2026-05-13',
        snapshotVersion: 2,
        tenantId: 'tenant-1',
        weightedValueAmountMinor: 8000,
      },
    ]);

    const dashboard = await getBranchManagerCrmReportingCore(
      { actor },
      {
        forecastSnapshotRepository,
        now: () => '2026-05-14T12:00:00.000Z',
        reportingRepository,
      }
    );

    expect(dashboard.snapshot).toEqual({ excludedRowCount: 0, rows: [], state: 'empty' });
  });

  it('derives branch-manager snapshot freshness from branch-manager thresholds', () => {
    expect(deriveBranchManagerCrmSnapshotFreshness('2026-05-13', '2026-05-14T12:00:00.000Z')).toBe(
      'fresh'
    );
    expect(deriveBranchManagerCrmSnapshotFreshness('2026-05-13', '2026-05-15T12:00:00.000Z')).toBe(
      'delayed'
    );
    expect(deriveBranchManagerCrmSnapshotFreshness('2026-05-13', '2026-05-16T12:00:00.000Z')).toBe(
      'stale'
    );
  });

  it('fails closed for branch managers without branch scope before repository reads', async () => {
    const { forecastSnapshotRepository, reportingRepository } = createRepositories();

    await expect(
      getBranchManagerCrmReportingCore(
        { actor: { ...actor, scope: {} } },
        { forecastSnapshotRepository, reportingRepository }
      )
    ).rejects.toMatchObject({
      name: 'BranchManagerCrmReportingAccessDeniedError',
      reason: 'branch_scope',
    } satisfies Partial<BranchManagerCrmReportingAccessDeniedError>);

    expect(reportingRepository.listWeightedPipelineRows).not.toHaveBeenCalled();
    expect(forecastSnapshotRepository.listLatestPipelineSnapshots).not.toHaveBeenCalled();
  });

  it('caps and sorts source rows by deal count, amount, source label, then currency', async () => {
    const { forecastSnapshotRepository, reportingRepository } = createRepositories();
    reportingRepository.listSourceBreakdownRows.mockResolvedValue([
      ...Array.from({ length: BRANCH_MANAGER_CRM_REPORTING_SOURCE_TOP_N + 3 }, (_, index) =>
        sourceBreakdownReportingRow({
          currencyCode: index % 2 === 0 ? 'EUR' : 'USD',
          dealId: `deal-${index}`,
          source: `source-${String(index).padStart(2, '0')}`,
          valueAmountMinor: 1000,
        })
      ),
      sourceBreakdownReportingRow({ dealId: 'top', source: 'alpha', valueAmountMinor: 5000 }),
      sourceBreakdownReportingRow({ dealId: 'top-2', source: 'alpha', valueAmountMinor: 5000 }),
    ]);

    const dashboard = await getBranchManagerCrmReportingCore(
      { actor },
      {
        forecastSnapshotRepository,
        now: () => '2026-05-14T12:00:00.000Z',
        reportingRepository,
      }
    );

    expect(dashboard.sourceBreakdown.state).toBe('data');
    expect(dashboard.sourceBreakdown.rows).toHaveLength(BRANCH_MANAGER_CRM_REPORTING_SOURCE_TOP_N);
    expect(dashboard.sourceBreakdown.rows[0]).toMatchObject({
      dealCount: 2,
      sourceLabel: 'alpha',
      totalAmountMinor: 10000,
    });
  });

  it('maps repository failures to branch-manager-safe widget errors', async () => {
    const { forecastSnapshotRepository, reportingRepository } = createRepositories();
    const logger = { error: vi.fn() };
    reportingRepository.listSourceBreakdownRows.mockRejectedValueOnce(
      new Error('database details with sensitive context')
    );

    const dashboard = await getBranchManagerCrmReportingCore(
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

  it('keeps branch-manager widget row shapes aggregate-only and PII-free', async () => {
    const { forecastSnapshotRepository, reportingRepository } = createRepositories();
    const dashboard = await getBranchManagerCrmReportingCore(
      { actor },
      { forecastSnapshotRepository, now: () => '2026-05-14T12:00:00.000Z', reportingRepository }
    );

    const rowKeys = [
      ...Object.keys(dashboard.snapshot.rows[0] ?? {}),
      ...Object.keys(dashboard.branchPipeline.rows[0] ?? {}),
      ...Object.keys(dashboard.sourceBreakdown.rows[0] ?? {}),
    ];

    for (const forbiddenKey of BRANCH_MANAGER_CRM_FORBIDDEN_PII_KEYS) {
      expect(rowKeys).not.toContain(forbiddenKey);
    }
  });
});
