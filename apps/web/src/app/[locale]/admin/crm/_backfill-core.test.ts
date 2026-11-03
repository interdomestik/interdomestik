import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it, vi } from 'vitest';
import {
  TEST_AUTHORITY,
  adminSession,
  coreResult,
  dryRunInput,
} from './_backfill-core.test-support';
import { createAdminCrmForecastBackfillConfirmationStore } from './_backfill-confirmation';
import { runAdminCrmForecastBackfillOperatorCore } from './_backfill-core';

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
});
