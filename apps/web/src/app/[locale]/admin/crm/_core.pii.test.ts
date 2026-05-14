import { describe, expect, it } from 'vitest';

import { ADMIN_CRM_FORBIDDEN_PII_KEYS } from './_core';
import type {
  AdminCrmBranchPipelineRow,
  AdminCrmLatestSnapshotRow,
  AdminCrmSourceBreakdownRow,
} from './_core';

type AdminCrmAggregateKey =
  | keyof AdminCrmBranchPipelineRow
  | keyof AdminCrmLatestSnapshotRow
  | keyof AdminCrmSourceBreakdownRow;

const aggregateSafeKeys: readonly AdminCrmAggregateKey[] = [
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

describe('admin CRM aggregate row shape', () => {
  it('does not expose PII-oriented field names', () => {
    for (const forbiddenKey of ADMIN_CRM_FORBIDDEN_PII_KEYS) {
      expect(aggregateSafeKeys).not.toContain(forbiddenKey);
    }
  });
});
