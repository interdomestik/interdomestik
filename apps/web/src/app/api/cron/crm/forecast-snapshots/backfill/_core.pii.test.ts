import { describe, expect, it } from 'vitest';

import { createCrmForecastSnapshotBackfillResult } from '../_core.test-helpers';

import { assertNoCrmForecastSnapshotBackfillPiiKeys } from './_core';

describe('assertNoCrmForecastSnapshotBackfillPiiKeys', () => {
  it('allows aggregate-safe response keys at every depth', () => {
    expect(() =>
      assertNoCrmForecastSnapshotBackfillPiiKeys(
        createCrmForecastSnapshotBackfillResult({
          sourceRunId: 'crm-forecast-snapshot-backfill:tenant-1:2026-05-14:2026-05-14:started',
        })
      )
    ).not.toThrow();
  });

  it('rejects PII-shaped keys nested anywhere in the response', () => {
    expect(() =>
      assertNoCrmForecastSnapshotBackfillPiiKeys({
        dateResults: [{ email: 'person@example.test', snapshotDate: '2026-05-14' }],
      })
    ).toThrow('PII key: email');
  });
});
