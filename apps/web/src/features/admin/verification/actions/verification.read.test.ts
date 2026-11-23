import type { TenantTransaction } from '@interdomestik/database';
import {
  ROLE_ADMIN,
  ROLE_BRANCH_MANAGER,
  ROLE_STAFF,
  ROLE_SUPER_ADMIN,
  ROLE_TENANT_ADMIN,
} from '@/lib/roles.core';
import { actionFailure } from '@/lib/safe-action.failure';
import { SalesClosedError } from '@interdomestik/database/pilot-switch';
import {
  expectNoDocumentContent,
  verificationRequest,
} from '../server/branch-manager-redaction.test-fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  withTenantContext: vi.fn(),
  verifyCashAttemptCore: vi.fn(),
  resubmitCashAttemptCore: vi.fn(),
  auditLog: { table: 'audit_log' },
}));

vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => (key: string) => `${namespace}.${key}`,
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: hoisted.getSession } } }));
vi.mock('@sentry/nextjs', () => ({
  setUser: vi.fn(),
  setTag: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock('@interdomestik/database', () => ({
  withTenantContext: hoisted.withTenantContext,
  auditLog: hoisted.auditLog,
}));

// Real reader; writers are inert spies that must never run for reads.
vi.mock('../server/verification.core', async () => {
  const requests = await vi.importActual<typeof import('../server/queries/get-requests')>(
    '../server/queries/get-requests'
  );
  const { resubmitCashSchema } =
    await vi.importActual<typeof import('../server/schemas')>('../server/schemas');
  return {
    getVerificationRequests: requests.getVerificationRequests,
    verifyCashAttemptCore: hoisted.verifyCashAttemptCore,
    resubmitCashAttemptCore: hoisted.resubmitCashAttemptCore,
    verifyCashSchema: { parse: vi.fn() },
    resubmitCashSchema,
  };
});

import { createRecordingTenantTransaction } from '@/test/recording-tenant-transaction';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import {
  getVerificationRequestsAction,
  resubmitCashAttemptAction,
  verifyCashAttemptAction,
} from './verification';

function createRecordingTx(results: unknown[][]) {
  const { tx, executed } = createRecordingTenantTransaction(results);
  hoisted.withTenantContext.mockImplementation(
    (_context: unknown, callback: (tx: TenantTransaction) => Promise<unknown>) =>
      Promise.resolve().then(() => callback(tx))
  );
  return { executed };
}

// A refusal runs no read: its only transaction is the wrapper's one `action.refused` audit insert.
function expectRefusalRecordOnly(code: string) {
  const select = vi.fn();
  const values = vi.fn(() => Promise.resolve());
  const insert = vi.fn(() => ({ values }));
  hoisted.withTenantContext.mockImplementation(
    (_context: unknown, callback: (tx: TenantTransaction) => Promise<unknown>) =>
      Promise.resolve().then(() => callback({ select, insert } as unknown as TenantTransaction))
  );
  return () => {
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledExactlyOnceWith(hoisted.auditLog);
    expect(values).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        tenantId: 'tenant-ks',
        action: 'action.refused',
        entityId: 'legacy',
        metadata: expect.objectContaining({ code }),
      })
    );
  };
}

// The read runs in a transaction minted for the session's tenant and role.
function actorOf(authority: unknown) {
  const { tenantId, principal } = readTenantAuthority(authority as TenantAuthority);
  return [tenantId, principal?.role];
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

describe('cash verification action failures', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [
      'approval',
      ROLE_STAFF,
      verifyCashAttemptAction,
      hoisted.verifyCashAttemptCore,
      { decision: 'approve' },
    ],
    ['resubmission', 'agent', resubmitCashAttemptAction, hoisted.resubmitCashAttemptCore, {}],
  ] as const)(
    'returns localized CLOSED for %s without a refusal audit',
    async (_name, role, action, core, fields) => {
      hoisted.getSession.mockResolvedValue(sessionFor(role, 'branch-1'));
      core.mockRejectedValueOnce(new SalesClosedError());

      await expect(action({ attemptId: 'attempt-1', ...fields })).resolves.toEqual({
        success: false,
        code: 'CLOSED',
        error: 'pricing.CLOSED',
      });
      expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    }
  );

  it('returns CONFLICT when the approval transaction rolls back', async () => {
    hoisted.getSession.mockResolvedValue(sessionFor(ROLE_STAFF, 'branch-1'));
    hoisted.verifyCashAttemptCore.mockRejectedValueOnce(actionFailure('CONFLICT'));

    await expect(
      verifyCashAttemptAction({ attemptId: 'attempt-1', decision: 'approve' })
    ).resolves.toMatchObject({ success: false, code: 'CONFLICT' });
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });
});

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

  it('redacts document content from the BM list action response', async () => {
    hoisted.getSession.mockResolvedValue(sessionFor(ROLE_BRANCH_MANAGER, 'branch-1'));
    createRecordingTx([[{ ...verificationRequest, memberEmailVerified: null }]]);

    const result = await getVerificationRequestsAction({ view: 'queue' });

    expect(result).toEqual({
      success: true,
      data: [
        {
          ...verificationRequest,
          memberActivationPending: false,
          documentId: null,
          documentPath: null,
          verificationNote: null,
        },
      ],
    });
    expectNoDocumentContent(result);
  });

  it.each([ROLE_STAFF, ROLE_ADMIN, ROLE_TENANT_ADMIN, ROLE_SUPER_ADMIN])(
    'preserves document content in the %s action payload',
    async role => {
      hoisted.getSession.mockResolvedValue(sessionFor(role, 'branch-1'));
      createRecordingTx([[{ ...verificationRequest, memberEmailVerified: null }]]);

      await expect(getVerificationRequestsAction({ view: 'queue' })).resolves.toEqual({
        success: true,
        data: [{ ...verificationRequest, memberActivationPending: false }],
      });
    }
  );

  it.each(['admin', 'tenant_admin', 'super_admin'])(
    'reads %s tenant-wide in the actor transaction',
    async role => {
      hoisted.getSession.mockResolvedValue(sessionFor(role, 'branch-1'));
      const rows = [{ id: 'attempt-1', memberEmailVerified: false }];
      const { executed } = createRecordingTx([rows]);

      await expect(getVerificationRequestsAction({ view: 'queue' })).resolves.toEqual({
        success: true,
        data: [{ id: 'attempt-1', memberActivationPending: true }],
      });
      expect(actorOf(hoisted.withTenantContext.mock.calls[0]?.[0])).toEqual(['tenant-ks', role]);
      expect(executed[0]?.params).not.toContain('branch-1');
    }
  );

  it.each(['branch_manager', 'staff'])('reads %s within the session branch', async role => {
    hoisted.getSession.mockResolvedValue(sessionFor(role, 'branch-1'));
    const { executed } = createRecordingTx([[]]);

    await expect(getVerificationRequestsAction({ view: 'history' })).resolves.toMatchObject({
      success: true,
    });
    expect(actorOf(hoisted.withTenantContext.mock.calls[0]?.[0])).toEqual(['tenant-ks', role]);
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
    const verifyRecord = expectRefusalRecordOnly('FORBIDDEN_NO_BRANCH');

    await expect(getVerificationRequestsAction({ view: 'queue' })).resolves.toMatchObject({
      success: false,
      code: 'FORBIDDEN_NO_BRANCH',
    });
    verifyRecord();
  });

  it.each(['member', 'agent', 'global_support', 'auditor', 'unknown', undefined])(
    'returns FORBIDDEN for role %j instead of an empty success',
    async role => {
      hoisted.getSession.mockResolvedValue(sessionFor(role, 'branch-1'));
      const verifyRecord = expectRefusalRecordOnly('FORBIDDEN');

      await expect(getVerificationRequestsAction({ view: 'queue' })).resolves.toMatchObject({
        success: false,
        code: 'FORBIDDEN',
      });
      verifyRecord();
    }
  );
});
