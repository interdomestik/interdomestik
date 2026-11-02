import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  db: {
    query: {
      user: { findFirst: vi.fn() },
      account: { findFirst: vi.fn() },
      tenantSettings: { findFirst: vi.fn() },
    },
    transaction: vi.fn(),
  },
  tx: {
    insert: vi.fn(),
    update: vi.fn(),
    query: {} as Record<string, unknown>,
  },
  withTenantContext: vi.fn(),
  resolvePaddleCustomerEmailOwner: vi.fn(),
  readVerifiedPaddleTransactionEvidence: vi.fn(),
  insertedUserValues: vi.fn(),
  updatedUserValues: vi.fn(),
  generateMemberNumber: vi.fn(),
  nanoid: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  agentClients: {
    tenantId: 'agent_clients.tenant_id',
    memberId: 'agent_clients.member_id',
    agentId: 'agent_clients.agent_id',
  },
  and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
  db: hoisted.db,
  eq: vi.fn((left, right) => ({ left, right })),
  user: { id: 'user.id' },
  withTenantContext: hoisted.withTenantContext,
}));

vi.mock('@interdomestik/database/paddle-provider-resolution', () => ({
  resolvePaddleCustomerEmailOwner: hoisted.resolvePaddleCustomerEmailOwner,
  readVerifiedPaddleTransactionEvidence: hoisted.readVerifiedPaddleTransactionEvidence,
}));

vi.mock('@interdomestik/database/member-number', () => ({
  generateMemberNumber: hoisted.generateMemberNumber,
}));

vi.mock('nanoid', () => ({
  nanoid: hoisted.nanoid,
}));

import { reconcileCheckoutUser } from './reconcile-checkout-user';

function insertedUserValuesInclude(fields: Record<string, unknown>): boolean {
  return hoisted.insertedUserValues.mock.calls.some(([value]) => {
    if (!value || typeof value !== 'object') return false;
    return Object.entries(fields).every(([key, expected]) => {
      return (value as Record<string, unknown>)[key] === expected;
    });
  });
}

describe('reconcileCheckoutUser', () => {
  const requestPasswordResetOnboarding = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.db.query.user.findFirst.mockReset();
    hoisted.db.query.account.findFirst.mockReset();
    hoisted.readVerifiedPaddleTransactionEvidence.mockReset();
    hoisted.resolvePaddleCustomerEmailOwner.mockReset().mockResolvedValue(null);
    hoisted.db.query.tenantSettings.findFirst.mockReset();
    hoisted.db.transaction.mockReset();
    hoisted.tx.insert.mockReset();
    hoisted.tx.update.mockReset();
    hoisted.insertedUserValues.mockReset();
    hoisted.updatedUserValues.mockReset();
    hoisted.generateMemberNumber.mockReset();
    hoisted.nanoid.mockReset();

    hoisted.nanoid.mockReturnValue('user_new');
    hoisted.generateMemberNumber.mockResolvedValue({
      memberNumber: 'MEM-2026-000123',
      isNew: true,
    });

    hoisted.db.transaction.mockImplementation(async callback => callback(hoisted.tx));
    // Tenant-scoped statements (writes via tx.insert/update, reads via tx.query) share one context mock.
    hoisted.tx.query = hoisted.db.query;
    hoisted.withTenantContext.mockReset();
    hoisted.withTenantContext.mockImplementation(async (_context, callback) =>
      callback(hoisted.tx)
    );

    hoisted.tx.insert.mockImplementation(() => ({
      values: hoisted.insertedUserValues,
    }));
    hoisted.insertedUserValues.mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    });

    hoisted.tx.update.mockImplementation(() => ({
      set: hoisted.updatedUserValues,
    }));
    hoisted.updatedUserValues.mockReturnValue({
      where: () => ({
        returning: async () => [{ id: 'user_existing' }],
      }),
    });
  });

  it('preserves elevated roles while still backfilling member state', async () => {
    hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'admin@example.com',
          customData: {
            tenantId: 'tenant_ks',
            agentId: 'agent_1',
          },
        },
      },
    });
    hoisted.resolvePaddleCustomerEmailOwner.mockResolvedValue({
      userId: 'user_admin',
      tenantId: 'tenant_ks',
    });
    hoisted.db.query.user.findFirst
      .mockResolvedValueOnce({
        id: 'user_admin',
        tenantId: 'tenant_ks',
        branchId: null,
        email: 'admin@example.com',
        name: 'Admin User',
        memberNumber: null,
        role: 'admin',
        agentId: null,
        createdBy: 'admin',
      })
      .mockResolvedValueOnce({
        id: 'user_admin',
        tenantId: 'tenant_ks',
        branchId: 'branch-ks-main',
        email: 'admin@example.com',
        name: 'Admin User',
        memberNumber: 'MEM-2026-000555',
        role: 'admin',
      });
    hoisted.db.query.account.findFirst.mockResolvedValue({
      id: 'acct_credential',
      providerId: 'credential',
    });
    hoisted.db.query.tenantSettings.findFirst.mockResolvedValue({
      value: { branchId: 'branch-ks-main' },
    });

    await reconcileCheckoutUser(
      {
        id: 'sub_admin',
        transactionId: 'txn_admin',
        customData: {
          tenantId: 'tenant_ks',
          agentId: 'agent_1',
        },
      },
      { requestPasswordResetOnboarding }
    );

    expect(hoisted.tx.update).toHaveBeenCalled();
    expect(hoisted.updatedUserValues).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'admin',
        branchId: 'branch-ks-main',
        agentId: 'agent_1',
        assistedByAgentId: 'agent_1',
        createdBy: 'admin',
      })
    );
    expect(hoisted.generateMemberNumber).toHaveBeenCalledWith(hoisted.tx, {
      userId: 'user_admin',
      joinedAt: expect.any(Date),
    });
    expect(insertedUserValuesInclude({ memberId: 'user_admin', status: 'active' })).toBe(false);
    expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();
  });

  it('returns null without any write when email ownership is ambiguous across tenants', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'shared@example.com',
          customData: { tenantId: 'tenant_mk' },
        },
      },
    });
    hoisted.resolvePaddleCustomerEmailOwner.mockResolvedValue('ambiguous');

    const result = await reconcileCheckoutUser(
      {
        id: 'sub_ambiguous',
        transactionId: 'txn_ambiguous',
        customData: { tenantId: 'tenant_mk' },
      },
      { requestPasswordResetOnboarding }
    );

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('is ambiguous'));
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(hoisted.db.query.user.findFirst).not.toHaveBeenCalled();
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(hoisted.tx.update).not.toHaveBeenCalled();
    expect(hoisted.generateMemberNumber).not.toHaveBeenCalled();
    expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('treats an email owner that is not visible in its own tenant as a conflict, never as absent', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'hidden@example.com',
          customData: { tenantId: 'tenant_mk' },
        },
      },
    });
    hoisted.resolvePaddleCustomerEmailOwner.mockResolvedValue({
      userId: 'user_hidden',
      tenantId: 'tenant_ks',
    });
    hoisted.db.query.user.findFirst.mockResolvedValue(undefined);

    const result = await reconcileCheckoutUser(
      { id: 'sub_hidden', transactionId: 'txn_hidden', customData: { tenantId: 'tenant_mk' } },
      { requestPasswordResetOnboarding }
    );

    expect(result).toBeNull();
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant_ks' },
      expect.any(Function)
    );
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(hoisted.tx.update).not.toHaveBeenCalled();
    expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('rethrows the unique violation when the raced email owner is ambiguous', async () => {
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
    hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'race@example.com',
          customData: { tenantId: 'tenant_mk' },
        },
      },
    });
    hoisted.resolvePaddleCustomerEmailOwner
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('ambiguous');
    hoisted.db.query.tenantSettings.findFirst.mockResolvedValue(undefined);
    hoisted.insertedUserValues.mockRejectedValueOnce(uniqueViolation);

    await expect(
      reconcileCheckoutUser(
        { id: 'sub_race', transactionId: 'txn_race', customData: { tenantId: 'tenant_mk' } },
        { requestPasswordResetOnboarding }
      )
    ).rejects.toBe(uniqueViolation);
    expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();
  });
});
