import { describe, expect, it } from 'vitest';

import {
  ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_FORBIDDEN_PII_KEYS,
  assertNoAdminCrmForecastBackfillOperatorPiiKeys,
} from './_backfill-core';

describe('admin CRM forecast backfill operator PII guard', () => {
  it('allows aggregate-safe result keys', () => {
    expect(() =>
      assertNoAdminCrmForecastBackfillOperatorPiiKeys({
        dateRows: [
          {
            failedWorkItems: 0,
            snapshotDate: '2026-05-14',
            snapshotsInserted: 0,
            status: 'completed',
            versionConflicts: 0,
            workItemsConsidered: 1,
            workItemsDeferred: 0,
            workItemsSucceeded: 1,
          },
        ],
        snapshotsInserted: 0,
        workItemsSucceeded: 1,
      })
    ).not.toThrow();
  });

  it('rejects unsafe PII-shaped keys at every depth', () => {
    for (const key of ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_FORBIDDEN_PII_KEYS) {
      expect(() =>
        assertNoAdminCrmForecastBackfillOperatorPiiKeys({
          nested: [{ [key]: 'unsafe-value' }],
        })
      ).toThrow(new RegExp(`PII key: ${key}`));
    }
  });
});
