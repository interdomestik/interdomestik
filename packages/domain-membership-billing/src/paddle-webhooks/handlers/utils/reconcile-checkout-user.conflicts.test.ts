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

  it('returns null when stored transaction payload tenant mismatches the existing user tenant', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'wrong@example.com',
          customData: {
            tenantId: 'tenant_mk',
          },
        },
      },
    });
    hoisted.resolvePaddleCustomerEmailOwner.mockResolvedValue({
      userId: 'user_wrong',
      tenantId: 'tenant_ks',
    });
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_wrong',
      tenantId: 'tenant_ks',
      email: 'wrong@example.com',
      name: 'Wrong Tenant',
      memberNumber: null,
      role: 'member',
    });

    const result = await reconcileCheckoutUser(
      {
        id: 'sub_wrong',
        transactionId: 'txn_wrong',
        customData: {
          tenantId: 'tenant_mk',
        },
      },
      { requestPasswordResetOnboarding }
    );

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('tenant mismatch'));
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(hoisted.tx.update).not.toHaveBeenCalled();
    expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('returns null when subscription customData conflicts with stored transaction tenant', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'buyer@example.com',
          customData: {
            tenantId: 'tenant_mk',
          },
        },
      },
    });

    const result = await reconcileCheckoutUser(
      {
        id: 'sub_conflict',
        transactionId: 'txn_conflict',
        customData: {
          tenantId: 'tenant_bad',
        },
      },
      { requestPasswordResetOnboarding }
    );

    expect(result).toBeNull();
    expect(hoisted.resolvePaddleCustomerEmailOwner).not.toHaveBeenCalled();
    expect(hoisted.db.query.user.findFirst).not.toHaveBeenCalled();
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(hoisted.tx.update).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('subscription customData conflicts with stored transaction')
    );

    warnSpy.mockRestore();
  });

  it('returns null when customData user does not match the canonical email user', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'existing@example.com',
          customData: {
            tenantId: 'tenant_ks',
            userId: 'user_stale',
          },
        },
      },
    });
    hoisted.resolvePaddleCustomerEmailOwner.mockResolvedValue({
      userId: 'user_existing',
      tenantId: 'tenant_ks',
    });
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_existing',
      tenantId: 'tenant_ks',
      email: 'existing@example.com',
      name: 'Existing Member',
      memberNumber: 'MEM-2026-000001',
      role: 'member',
    });

    const result = await reconcileCheckoutUser(
      {
        id: 'sub_user_conflict',
        transactionId: 'txn_user_conflict',
      },
      { requestPasswordResetOnboarding }
    );

    expect(result).toBeNull();
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(hoisted.tx.update).not.toHaveBeenCalled();
    expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'customData user=user_stale does not match canonical email user=user_existing'
      )
    );

    warnSpy.mockRestore();
  });

  it('returns null instead of creating a member when customData asserts a missing user', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'new@example.com',
          customData: {
            tenantId: 'tenant_mk',
            userId: 'user_missing',
          },
        },
      },
    });
    hoisted.db.query.user.findFirst.mockResolvedValue(null);

    const result = await reconcileCheckoutUser(
      {
        id: 'sub_missing_user',
        transactionId: 'txn_missing_user',
      },
      { requestPasswordResetOnboarding }
    );

    expect(result).toBeNull();
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(hoisted.tx.update).not.toHaveBeenCalled();
    expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'customData user=user_missing does not match canonical email user=none'
      )
    );

    warnSpy.mockRestore();
  });
});
