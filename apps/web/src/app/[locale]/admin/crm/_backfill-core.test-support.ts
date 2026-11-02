import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { CrmForecastSnapshotBackfillResult } from '../../../api/cron/crm/forecast-snapshots/backfill/_core';
import type { AdminCrmForecastBackfillOperatorActionInput } from './_backfill-types';

export const TEST_AUTHORITY = mintTestTenantAuthority('tenant-1');

export function adminSession(role = 'admin') {
  return {
    user: {
      branchId: null,
      id: `${role}-1`,
      role,
      tenantId: 'tenant-1',
    },
  };
}

export function coreResult(
  overrides: Partial<CrmForecastSnapshotBackfillResult> = {}
): CrmForecastSnapshotBackfillResult {
  return {
    completedAt: '2026-05-15T10:00:01.000Z',
    dateResults: [
      {
        failedWorkItems: 0,
        snapshotDate: '2026-05-14',
        snapshotsInserted: 0,
        status: 'dry_run' as const,
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
    dryRun: true,
    failedWorkItems: 0,
    fromDate: '2026-05-14',
    snapshotsInserted: 0,
    sourceRunId: 'crm-forecast-snapshot-backfill:tenant-1:2026-05-14:run-1',
    startedAt: '2026-05-15T10:00:00.000Z',
    tenantId: 'tenant-1',
    toDate: '2026-05-14',
    versionConflicts: 0,
    workItemsConsidered: 1,
    workItemsDeferred: 0,
    workItemsSucceeded: 1,
    ...overrides,
  };
}

export function dryRunInput(
  overrides: Partial<AdminCrmForecastBackfillOperatorActionInput['request']> = {}
): AdminCrmForecastBackfillOperatorActionInput {
  return {
    mode: 'dry_run',
    request: {
      fromDate: '2026-05-14',
      tenantId: 'tenant-1',
      toDate: '2026-05-14',
      ...overrides,
    },
  };
}
