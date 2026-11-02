import { describe, expect, it, vi } from 'vitest';
import {
  TEST_AUTHORITY,
  adminSession,
  coreResult,
  dryRunInput,
} from './_backfill-core.test-support';
import { createAdminCrmForecastBackfillConfirmationStore } from './_backfill-confirmation';
import {
  assertNoAdminCrmForecastBackfillOperatorPiiKeys,
  runAdminCrmForecastBackfillOperatorCore,
} from './_backfill-core';
import type { CrmForecastSnapshotBackfillResult } from '../../../api/cron/crm/forecast-snapshots/backfill/_core';
import type { AdminCrmForecastBackfillOperatorActionInput } from './_backfill-types';

describe('runAdminCrmForecastBackfillOperatorCore', () => {
  it('requires a matching single-use dry-run confirmation before write mode', async () => {
    const confirmationStore = createAdminCrmForecastBackfillConfirmationStore({
      secret: 'test-confirmation-secret-32chars',
    });
    const runBackfillCore = vi
      .fn()
      .mockResolvedValueOnce(coreResult())
      .mockResolvedValueOnce(
        coreResult({
          dateResults: [
            {
              failedWorkItems: 0,
              snapshotDate: '2026-05-14',
              snapshotsInserted: 1,
              status: 'completed' as const,
              versionConflicts: 0,
              workItemsConsidered: 1,
              workItemsDeferred: 0,
              workItemsSucceeded: 1,
            },
          ],
          dryRun: false,
          snapshotsInserted: 1,
        })
      );

    const dryRun = await runAdminCrmForecastBackfillOperatorCore(
      { input: dryRunInput(), authority: TEST_AUTHORITY, session: adminSession() },
      {
        confirmationStore,
        now: () => new Date('2026-05-15T10:00:00.000Z'),
        runBackfillCore,
      }
    );
    const confirmationToken = dryRun.result?.confirmationToken;

    const write = await runAdminCrmForecastBackfillOperatorCore(
      {
        input: {
          confirmationToken,
          mode: 'write',
          request: dryRunInput().request,
        },
        authority: TEST_AUTHORITY,
        session: adminSession(),
      },
      {
        confirmationStore,
        now: () => new Date('2026-05-15T10:01:00.000Z'),
        runBackfillCore,
      }
    );

    expect(write.success).toBe(true);
    expect(write.result?.confirmationToken).toBeNull();
    expect(write.result?.snapshotsInserted).toBe(1);

    const replay = await runAdminCrmForecastBackfillOperatorCore(
      {
        input: {
          confirmationToken,
          mode: 'write',
          request: dryRunInput().request,
        },
        authority: TEST_AUTHORITY,
        session: adminSession(),
      },
      { confirmationStore, runBackfillCore }
    );
    expect(replay).toEqual({
      errorCode: 'confirmation_invalid',
      result: null,
      success: false,
    });
  });

  it('maps duplicate in-flight write attempts to confirmation_in_flight', async () => {
    const confirmationStore = createAdminCrmForecastBackfillConfirmationStore({
      secret: 'test-confirmation-secret-32chars',
    });
    const token = confirmationStore.create(
      {
        actorId: 'admin-1',
        fromDate: '2026-05-14',
        maxWorkItemsPerDate: null,
        tenantId: 'tenant-1',
        toDate: '2026-05-14',
      },
      '2026-05-15T10:00:00.000Z'
    );
    let resolveRun!: (value: CrmForecastSnapshotBackfillResult) => void;
    const runBackfillCore = vi.fn(
      () =>
        new Promise<CrmForecastSnapshotBackfillResult>(resolve => {
          resolveRun = resolve;
        })
    );
    const input: AdminCrmForecastBackfillOperatorActionInput = {
      confirmationToken: token,
      mode: 'write',
      request: dryRunInput().request,
    };

    const first = runAdminCrmForecastBackfillOperatorCore(
      { input, authority: TEST_AUTHORITY, session: adminSession() },
      {
        confirmationStore,
        now: () => new Date('2026-05-15T10:01:00.000Z'),
        runBackfillCore,
      }
    );
    const second = await runAdminCrmForecastBackfillOperatorCore(
      { input, authority: TEST_AUTHORITY, session: adminSession() },
      {
        confirmationStore,
        now: () => new Date('2026-05-15T10:01:01.000Z'),
        runBackfillCore,
      }
    );

    expect(second).toEqual({
      errorCode: 'confirmation_in_flight',
      result: null,
      success: false,
    });
    resolveRun(coreResult({ dryRun: false }));
    await first;
  });

  it('keeps operator output aggregate-only at every depth', () => {
    expect(() =>
      assertNoAdminCrmForecastBackfillOperatorPiiKeys({
        result: { dateRows: [{ snapshotDate: '2026-05-14', workItemsSucceeded: 1 }] },
      })
    ).not.toThrow();

    expect(() =>
      assertNoAdminCrmForecastBackfillOperatorPiiKeys({
        result: { nested: [{ email: 'member@example.com' }] },
      })
    ).toThrow(/PII key: email/);
    expect(() =>
      assertNoAdminCrmForecastBackfillOperatorPiiKeys({
        result: { nested: [{ dealId: 'deal-1' }] },
      })
    ).toThrow(/PII key: dealId/);
  });
});
