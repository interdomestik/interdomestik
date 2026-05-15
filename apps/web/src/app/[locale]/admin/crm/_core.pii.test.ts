import { describe, expect, it } from 'vitest';

import { ADMIN_CRM_FORBIDDEN_PII_KEYS } from './_core';
import type {
  AdminCrmBranchPipelineRow,
  AdminCrmForecastAlertMetrics,
  AdminCrmForecastAlertResult,
  AdminCrmForecastObservabilityBatchRow,
  AdminCrmForecastObservabilityCoverageRow,
  AdminCrmForecastObservabilitySummary,
  AdminCrmLatestSnapshotRow,
  AdminCrmSourceBreakdownRow,
} from './_core';

type AdminCrmAggregateKey =
  | keyof AdminCrmBranchPipelineRow
  | keyof AdminCrmForecastAlertMetrics
  | keyof AdminCrmForecastAlertResult
  | keyof AdminCrmForecastObservabilityBatchRow
  | keyof AdminCrmForecastObservabilityCoverageRow
  | keyof AdminCrmForecastObservabilitySummary
  | keyof AdminCrmLatestSnapshotRow
  | keyof AdminCrmSourceBreakdownRow;

const aggregateSafeKeys: readonly AdminCrmAggregateKey[] = [
  'branchId',
  'branchLabel',
  'branchCount',
  'closedLostAmountMinor',
  'closedWonAmountMinor',
  'currencyCode',
  'currencyCount',
  'dealCount',
  'delayedWorkItems',
  'explanationMessageKey',
  'excludedInconsistentForecastCount',
  'expectedWorkItems',
  'expectedWorkItemsDeferred',
  'firstSnapshotCreatedAt',
  'freshness',
  'generatedAt',
  'headlineMessageKey',
  'latestSnapshotCreatedAt',
  'latestSourceRunId',
  'lastSnapshotCreatedAt',
  'missingWorkItems',
  'metrics',
  'observedWorkItems',
  'openDealCount',
  'pipelineId',
  'pipelineLabel',
  'pipelineCount',
  'snapshotDate',
  'snapshotVersion',
  'sourceLabel',
  'sourceRunId',
  'staleWorkItems',
  'severity',
  'status',
  'totalAmountMinor',
  'totalPipelineAmountMinor',
  'unexpectedObservedWorkItems',
  'weightedAmountMinor',
  'weightedPipelineAmountMinor',
];

describe('admin CRM aggregate row shape', () => {
  it('does not expose PII-oriented field names', () => {
    for (const forbiddenKey of ADMIN_CRM_FORBIDDEN_PII_KEYS) {
      expect(aggregateSafeKeys).not.toContain(forbiddenKey);
    }
  });
});
