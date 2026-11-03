import { vi } from 'vitest';

import { hoisted, TEST_AUTHORITY } from './page.test-support';

export function resetAdminCrmPageMocks() {
  vi.clearAllMocks();
  hoisted.authorizeSessionTenantMock.mockResolvedValue({ authority: TEST_AUTHORITY });
  hoisted.getSessionSafeMock.mockResolvedValue({
    user: {
      branchId: null,
      id: 'admin-1',
      role: 'admin',
      tenantId: 'tenant-1',
    },
  });
  hoisted.getAdminCrmReportingCoreMock.mockResolvedValue({
    branchPipeline: {
      excludedRowCount: 0,
      rows: [
        {
          branchId: null,
          branchLabel: 'tenant',
          currencyCode: 'EUR',
          excludedInconsistentForecastCount: 0,
          openDealCount: 2,
          pipelineId: 'pipeline-1',
          pipelineLabel: 'pipeline-1',
          totalPipelineAmountMinor: 10000,
          weightedPipelineAmountMinor: 8000,
        },
      ],
      state: 'data',
    },
    forecastObservability: {
      batchRows: [
        {
          branchCount: 1,
          currencyCount: 1,
          firstSnapshotCreatedAt: '2026-05-14T05:00:00.000Z',
          lastSnapshotCreatedAt: '2026-05-14T05:20:00.000Z',
          observedWorkItems: 1,
          pipelineCount: 1,
          snapshotDate: '2026-05-13',
          sourceRunId: 'run-1',
        },
      ],
      coverageRows: [
        {
          branchId: null,
          branchLabel: 'No branch',
          currencyCode: 'EUR',
          latestSnapshotCreatedAt: '2026-05-14T05:20:00.000Z',
          pipelineId: 'pipeline-1',
          pipelineLabel: 'pipeline-1',
          snapshotDate: '2026-05-13',
          snapshotVersion: 1,
          sourceRunId: 'run-1',
          status: 'fresh',
        },
      ],
      hiddenCoverageRowCount: 0,
      state: 'data',
      summary: {
        delayedWorkItems: 0,
        expectedWorkItems: 1,
        expectedWorkItemsDeferred: 0,
        generatedAt: '2026-05-14T12:00:00.000Z',
        latestSnapshotCreatedAt: '2026-05-14T05:20:00.000Z',
        latestSourceRunId: 'run-1',
        missingWorkItems: 0,
        observedWorkItems: 1,
        snapshotDate: '2026-05-13',
        staleWorkItems: 0,
        unexpectedObservedWorkItems: 0,
      },
    },
    forecastAlert: {
      explanationMessageKey: 'forecastAlert.ok.explanation',
      generatedAt: '2026-05-14T12:00:00.000Z',
      headlineMessageKey: 'forecastAlert.ok.headline',
      metrics: {
        delayedWorkItems: 0,
        expectedWorkItems: 1,
        expectedWorkItemsDeferred: 0,
        latestSnapshotCreatedAt: '2026-05-14T05:20:00.000Z',
        latestSourceRunId: 'run-1',
        missingWorkItems: 0,
        observedWorkItems: 1,
        staleWorkItems: 0,
        unexpectedObservedWorkItems: 0,
      },
      severity: 'ok',
      snapshotDate: '2026-05-13',
    },
    generatedAt: '2026-05-14T12:00:00.000Z',
    snapshot: {
      excludedRowCount: 0,
      rows: [
        {
          branchId: null,
          closedLostAmountMinor: 0,
          closedWonAmountMinor: 0,
          currencyCode: 'EUR',
          freshness: 'fresh',
          openDealCount: 2,
          pipelineId: 'pipeline-1',
          snapshotDate: '2026-05-13',
          snapshotVersion: 1,
          totalPipelineAmountMinor: 10000,
          weightedPipelineAmountMinor: 8000,
        },
      ],
      state: 'data',
    },
    snapshotDate: '2026-05-13',
    sourceBreakdown: {
      excludedRowCount: 1,
      rows: [
        {
          currencyCode: 'EUR',
          dealCount: 2,
          excludedInconsistentForecastCount: 0,
          sourceLabel: 'website',
          totalAmountMinor: 10000,
          weightedAmountMinor: 8000,
        },
      ],
      state: 'data',
    },
    window: {
      from: '2026-02-13T12:00:00.000Z',
      to: '2026-05-14T12:00:00.000Z',
    },
  });
  hoisted.getBranchManagerCrmReportingCoreMock.mockResolvedValue({
    branchLabel: 'branch-1',
    branchPipeline: {
      excludedRowCount: 0,
      rows: [
        {
          branchId: 'branch-1',
          branchLabel: 'branch-1',
          currencyCode: 'EUR',
          excludedInconsistentForecastCount: 0,
          openDealCount: 2,
          pipelineId: 'pipeline-1',
          pipelineLabel: 'pipeline-1',
          totalPipelineAmountMinor: 10000,
          weightedPipelineAmountMinor: 8000,
        },
      ],
      state: 'data',
    },
    generatedAt: '2026-05-14T12:00:00.000Z',
    snapshot: {
      excludedRowCount: 0,
      rows: [
        {
          branchId: 'branch-1',
          branchLabel: 'branch-1',
          closedLostAmountMinor: 0,
          closedWonAmountMinor: 0,
          currencyCode: 'EUR',
          freshness: 'fresh',
          openDealCount: 2,
          pipelineId: 'pipeline-1',
          pipelineLabel: 'pipeline-1',
          snapshotDate: '2026-05-13',
          snapshotVersion: 1,
          totalPipelineAmountMinor: 10000,
          weightedPipelineAmountMinor: 8000,
        },
      ],
      state: 'data',
    },
    snapshotDate: '2026-05-13',
    sourceBreakdown: {
      excludedRowCount: 1,
      rows: [
        {
          branchId: 'branch-1',
          branchLabel: 'branch-1',
          currencyCode: 'EUR',
          dealCount: 2,
          excludedInconsistentForecastCount: 0,
          sourceLabel: 'website',
          totalAmountMinor: 10000,
          weightedAmountMinor: 8000,
        },
      ],
      state: 'data',
    },
    window: {
      from: '2026-02-13T12:00:00.000Z',
      to: '2026-05-14T12:00:00.000Z',
    },
  });
  hoisted.getAdminCrmRoutingRulesCoreMock.mockResolvedValue({
    counts: { active: 1, archived: 0 },
    rules: [
      {
        agentPoolCount: 2,
        archived: false,
        capacityCaps: {
          maxNewLeadsPerAgentPerDay: null,
          maxOpenLeadsPerAgent: null,
        },
        effectiveWindow: { from: null, to: null },
        enabled: true,
        fallback: { agentId: null, ruleId: null },
        filters: {
          leadType: null,
          source: 'website',
          utmCampaign: null,
          utmMedium: null,
          utmSource: null,
        },
        id: 'rule-1',
        priority: 0,
        scope: { kind: 'tenant' },
        strategy: 'round_robin',
        updatedAt: '2026-05-14T12:00:00.000Z',
      },
    ],
  });
}
