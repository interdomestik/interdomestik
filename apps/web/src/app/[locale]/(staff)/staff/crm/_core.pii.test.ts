import { describe, expect, it } from 'vitest';

import { STAFF_CRM_FORBIDDEN_PII_KEYS } from './_core';
import type {
  StaffCrmFunnelMovementRow,
  StaffCrmPipelineWorkloadRow,
  StaffCrmStageVelocityRow,
} from './_core';

type StaffCrmAggregateKey =
  | keyof StaffCrmFunnelMovementRow
  | keyof StaffCrmPipelineWorkloadRow
  | keyof StaffCrmStageVelocityRow;

const aggregateSafeKeys: readonly StaffCrmAggregateKey[] = [
  'averageDays',
  'branchId',
  'branchLabel',
  'conversionRateBps',
  'currencyCode',
  'dropOffRateBps',
  'enteredCount',
  'exitedCount',
  'excludedInconsistentForecastCount',
  'forecastBestAmountMinor',
  'forecastCommitAmountMinor',
  'lostCount',
  'maximumDays',
  'medianDays',
  'minimumDays',
  'openDealCount',
  'pipelineId',
  'pipelineLabel',
  'sampleCount',
  'stageId',
  'stageLabel',
  'totalPipelineAmountMinor',
  'weightedPipelineAmountMinor',
  'wonCount',
];

describe('staff CRM aggregate row shape', () => {
  it('does not expose PII-oriented field names', () => {
    for (const forbiddenKey of STAFF_CRM_FORBIDDEN_PII_KEYS) {
      expect(aggregateSafeKeys).not.toContain(forbiddenKey);
    }
  });
});
