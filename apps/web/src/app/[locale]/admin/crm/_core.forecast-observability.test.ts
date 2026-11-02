import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_AUTHORITY, actor, createRepositories } from './_core.test-support';
import {
  ADMIN_CRM_FORBIDDEN_PII_KEYS,
  deriveAdminCrmForecastAlert,
  deriveAdminCrmForecastObservability,
  getAdminCrmReportingCore,
} from './_core';

describe('admin CRM reporting core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      { authority: TEST_AUTHORITY, actor },
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
