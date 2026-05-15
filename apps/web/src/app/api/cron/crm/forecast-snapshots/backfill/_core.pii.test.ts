import { describe, expect, it } from 'vitest';

import { assertNoCrmForecastSnapshotBackfillPiiKeys } from './_core';

describe('assertNoCrmForecastSnapshotBackfillPiiKeys', () => {
  it('allows aggregate-safe response keys at every depth', () => {
    expect(() =>
      assertNoCrmForecastSnapshotBackfillPiiKeys({
        completedAt: '2026-05-15T10:30:01.000Z',
        dateResults: [
          {
            failedWorkItems: 0,
            snapshotDate: '2026-05-14',
            snapshotsInserted: 1,
            status: 'completed',
            versionConflicts: 0,
            workItemsConsidered: 1,
            workItemsDeferred: 0,
            workItemsSucceeded: 1,
          },
        ],
        datesConsidered: 1,
        datesDeferred: 0,
        datesFailed: 0,
        datesSucceeded: 1,
        dryRun: false,
        failedWorkItems: 0,
        fromDate: '2026-05-14',
        snapshotsInserted: 1,
        sourceRunId: 'crm-forecast-snapshot-backfill:tenant-1:2026-05-14:2026-05-14:started',
        startedAt: '2026-05-15T10:30:00.000Z',
        tenantId: 'tenant-1',
        toDate: '2026-05-14',
        versionConflicts: 0,
        workItemsConsidered: 1,
        workItemsDeferred: 0,
        workItemsSucceeded: 1,
      })
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
