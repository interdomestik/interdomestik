import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it, vi } from 'vitest';

import { createAdminCrmForecastBackfillConfirmationStore } from './_backfill-confirmation';
import {
  assertNoAdminCrmForecastBackfillOperatorPiiKeys,
  runAdminCrmForecastBackfillOperatorCore,
} from './_backfill-core';
import type { CrmForecastSnapshotBackfillResult } from '../../../api/cron/crm/forecast-snapshots/backfill/_core';
import type { AdminCrmForecastBackfillOperatorActionInput } from './_backfill-types';

const TEST_AUTHORITY = mintTestTenantAuthority('tenant-1');

function adminSession(role = 'admin') {
  return {
    user: {
      branchId: null,
      id: `${role}-1`,
      role,
      tenantId: 'tenant-1',
    },
  };
}

function coreResult(
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

function dryRunInput(
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

describe('runAdminCrmForecastBackfillOperatorCore', () => {
  it('checks admin session role before request validation or CRM17 core invocation', async () => {
    const runBackfillCore = vi.fn();

    const result = await runAdminCrmForecastBackfillOperatorCore(
      {
        input: { request: { tenantId: '' } },
        authority: TEST_AUTHORITY,
        session: adminSession('branch_manager'),
      },
      { runBackfillCore }
    );

    expect(result).toEqual({ errorCode: 'unauthorized', result: null, success: false });
    expect(runBackfillCore).not.toHaveBeenCalled();
  });

  it.each(['admin', 'tenant_admin', 'super_admin'])(
    'maps %s sessions to the normalized admin actor and returns a dry-run confirmation',
    async role => {
      const confirmationStore = createAdminCrmForecastBackfillConfirmationStore({
        secret: 'test-confirmation-secret-32chars',
      });
      const runBackfillCore = vi.fn(async () => coreResult());

      const result = await runAdminCrmForecastBackfillOperatorCore(
        { input: dryRunInput(), authority: TEST_AUTHORITY, session: adminSession(role) },
        {
          confirmationStore,
          now: () => new Date('2026-05-15T10:00:00.000Z'),
          runBackfillCore,
        }
      );

      expect(result.success).toBe(true);
      expect(result.result?.confirmationToken).toEqual(expect.any(String));
      expect(result.result?.snapshotsInserted).toBe(0);
      expect(runBackfillCore).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: true,
          fromDate: '2026-05-14',
          toDate: '2026-05-14',
        })
      );
      const [coreArgs] = (runBackfillCore.mock.calls as unknown as [Record<string, unknown>][])[0];
      expect(coreArgs.authority).toBe(TEST_AUTHORITY);
      expect(coreArgs).not.toHaveProperty('tenantId');
    }
  );

  it('rejects submitted tenant drift before invoking the backfill core', async () => {
    const runBackfillCore = vi.fn();

    const result = await runAdminCrmForecastBackfillOperatorCore(
      {
        input: dryRunInput({ tenantId: 'tenant-2' }),
        authority: TEST_AUTHORITY,
        session: adminSession(),
      },
      { runBackfillCore }
    );

    expect(result).toEqual({ errorCode: 'invalid_tenant', result: null, success: false });
    expect(runBackfillCore).not.toHaveBeenCalled();
  });

  it('fails closed without a tenant authority, however the session reads', async () => {
    const runBackfillCore = vi.fn();

    const result = await runAdminCrmForecastBackfillOperatorCore(
      { authority: null, input: dryRunInput(), session: adminSession() },
      { runBackfillCore }
    );

    expect(result).toEqual({ errorCode: 'unauthorized', result: null, success: false });
    expect(runBackfillCore).not.toHaveBeenCalled();
  });

  it('fails closed when the authority belongs to a different tenant than the session', async () => {
    const runBackfillCore = vi.fn();

    const result = await runAdminCrmForecastBackfillOperatorCore(
      {
        authority: mintTestTenantAuthority('tenant-2'),
        input: dryRunInput(),
        session: adminSession(),
      },
      { runBackfillCore }
    );

    expect(result).toEqual({ errorCode: 'unauthorized', result: null, success: false });
    expect(runBackfillCore).not.toHaveBeenCalled();
  });

  it('fails closed for tenantless admin sessions', async () => {
    const runBackfillCore = vi.fn();

    const result = await runAdminCrmForecastBackfillOperatorCore(
      {
        authority: TEST_AUTHORITY,
        input: dryRunInput(),
        session: {
          user: {
            id: 'admin-1',
            role: 'admin',
            tenantId: null,
          },
        },
      },
      { runBackfillCore }
    );

    expect(result).toEqual({ errorCode: 'unauthorized', result: null, success: false });
    expect(runBackfillCore).not.toHaveBeenCalled();
  });

  it('returns stable rate_limited errors for per-actor action limits', async () => {
    const rateLimit = vi.fn(async () => ({
      error: 'Too many requests',
      limited: true as const,
      retryAfter: 60,
      status: 429 as const,
    }));
    const runBackfillCore = vi.fn();

    const result = await runAdminCrmForecastBackfillOperatorCore(
      { input: dryRunInput(), authority: TEST_AUTHORITY, session: adminSession() },
      { rateLimit, runBackfillCore }
    );

    expect(result).toEqual({ errorCode: 'rate_limited', result: null, success: false });
    expect(rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        keySuffix: 'admin-1',
        limit: 6,
        name: 'action:admin-crm-forecast-backfill:dry_run:admin-1',
      })
    );
    expect(runBackfillCore).not.toHaveBeenCalled();
  });

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
