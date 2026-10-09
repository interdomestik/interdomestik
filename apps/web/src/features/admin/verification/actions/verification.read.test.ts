import type { TenantTransaction } from '@interdomestik/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  withTenantContext: vi.fn(),
  verifyCashAttemptCore: vi.fn(),
  resubmitCashAttemptCore: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: hoisted.getSession } } }));
vi.mock('@sentry/nextjs', () => ({
  setUser: vi.fn(),
  setTag: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock('@interdomestik/database', () => ({ withTenantContext: hoisted.withTenantContext }));

// Real reader; writers are inert spies that must never run for reads.
vi.mock('../server/verification.core', async () => {
  const requests = await vi.importActual<typeof import('../server/queries/get-requests')>(
    '../server/queries/get-requests'
  );
  return {
    getVerificationRequests: requests.getVerificationRequests,
    verifyCashAttemptCore: hoisted.verifyCashAttemptCore,
    resubmitCashAttemptCore: hoisted.resubmitCashAttemptCore,
    verifyCashSchema: { parse: vi.fn() },
    resubmitCashSchema: { parse: vi.fn() },
  };
});

import { createRecordingTenantTransaction } from '@/test/recording-tenant-transaction';
import { getVerificationRequestsAction } from './verification';

function createRecordingTx(results: unknown[][]) {
  const { tx, executed } = createRecordingTenantTransaction(results);
  hoisted.withTenantContext.mockImplementation(
    async (_context: unknown, callback: (tx: TenantTransaction) => Promise<unknown>) => callback(tx)
  );
  return { executed };
}

function sessionFor(role: string | undefined, branchId: string | null = null) {
  return {
    session: { id: 'session-1' },
    user: {
      id: 'user-1',
      email: 'u@example.test',
      name: 'U',
      role,
      tenantId: 'tenant-ks',
      branchId,
    },
  };
}

describe('getVerificationRequestsAction read admission', () => {
  beforeEach(() => {
    hoisted.getSession.mockReset();
    hoisted.withTenantContext.mockReset();
  });

  afterEach(() => {
    expect(hoisted.verifyCashAttemptCore).not.toHaveBeenCalled();
    expect(hoisted.resubmitCashAttemptCore).not.toHaveBeenCalled();
  });

  it('returns UNAUTHORIZED without a session and without SQL', async () => {
    hoisted.getSession.mockResolvedValue(null);

    await expect(getVerificationRequestsAction({ view: 'queue' })).resolves.toMatchObject({
      success: false,
      code: 'UNAUTHORIZED',
    });
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it.each(['admin', 'tenant_admin', 'super_admin'])(
    'reads %s tenant-wide in the actor transaction',
    async role => {
      hoisted.getSession.mockResolvedValue(sessionFor(role, 'branch-1'));
      const rows = [{ id: 'attempt-1' }];
      const { executed } = createRecordingTx([rows]);

      await expect(getVerificationRequestsAction({ view: 'queue' })).resolves.toEqual({
        success: true,
        data: rows,
      });
      expect(hoisted.withTenantContext.mock.calls[0]?.[0]).toStrictEqual({
        tenantId: 'tenant-ks',
        role,
      });
      expect(executed[0]?.params).not.toContain('branch-1');
    }
  );

  it.each(['branch_manager', 'staff'])('reads %s within the session branch', async role => {
    hoisted.getSession.mockResolvedValue(sessionFor(role, 'branch-1'));
    const { executed } = createRecordingTx([[]]);

    await expect(getVerificationRequestsAction({ view: 'history' })).resolves.toMatchObject({
      success: true,
    });
    expect(hoisted.withTenantContext.mock.calls[0]?.[0]).toStrictEqual({
      tenantId: 'tenant-ks',
      role,
    });
    expect(executed[0]?.params).toContain('branch-1');
  });

  it('keeps branchless staff empty without a transaction', async () => {
    hoisted.getSession.mockResolvedValue(sessionFor('staff', null));

    await expect(getVerificationRequestsAction({ view: 'queue' })).resolves.toEqual({
      success: true,
      data: [],
    });
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it('keeps the wrapper FORBIDDEN_NO_BRANCH for a branchless branch manager', async () => {
    hoisted.getSession.mockResolvedValue(sessionFor('branch_manager', null));

    await expect(getVerificationRequestsAction({ view: 'queue' })).resolves.toMatchObject({
      success: false,
      code: 'FORBIDDEN_NO_BRANCH',
    });
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it.each(['member', 'agent', 'global_support', 'auditor', 'unknown', undefined])(
    'returns FORBIDDEN for role %j instead of an empty success',
    async role => {
      hoisted.getSession.mockResolvedValue(sessionFor(role, 'branch-1'));

      await expect(getVerificationRequestsAction({ view: 'queue' })).resolves.toMatchObject({
        success: false,
        code: 'FORBIDDEN',
      });
      expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    }
  );
});
