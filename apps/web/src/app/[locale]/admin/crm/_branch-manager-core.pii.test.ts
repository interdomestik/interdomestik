import { describe, expect, it } from 'vitest';

import { BRANCH_MANAGER_CRM_FORBIDDEN_PII_KEYS } from './_branch-manager-core';
import type {
  BranchManagerCrmPipelineRow,
  BranchManagerCrmSnapshotRow,
  BranchManagerCrmSourceBreakdownRow,
} from './_branch-manager-core';

type BranchManagerCrmAggregateKey =
  | keyof BranchManagerCrmPipelineRow
  | keyof BranchManagerCrmSnapshotRow
  | keyof BranchManagerCrmSourceBreakdownRow;

const aggregateSafeKeys: readonly BranchManagerCrmAggregateKey[] = [
  'branchId',
  'branchLabel',
  'closedLostAmountMinor',
  'closedWonAmountMinor',
  'currencyCode',
  'dealCount',
  'excludedInconsistentForecastCount',
  'freshness',
  'openDealCount',
  'pipelineId',
  'pipelineLabel',
  'snapshotDate',
  'snapshotVersion',
  'sourceLabel',
  'totalAmountMinor',
  'totalPipelineAmountMinor',
  'weightedAmountMinor',
  'weightedPipelineAmountMinor',
];

describe('branch-manager CRM aggregate row shape', () => {
  it('does not expose PII-oriented field names', () => {
    for (const forbiddenKey of BRANCH_MANAGER_CRM_FORBIDDEN_PII_KEYS) {
      expect(aggregateSafeKeys).not.toContain(forbiddenKey);
    }
  });
});
