import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  db: {
    query: {
      user: { findFirst: vi.fn() },
      account: { findFirst: vi.fn() },
      webhookEvents: { findFirst: vi.fn() },
      tenantSettings: { findFirst: vi.fn() },
    },
    transaction: vi.fn(),
  },
  tx: {
    insert: vi.fn(),
    update: vi.fn(),
  },
  insertedUserValues: vi.fn(),
  updatedUserValues: vi.fn(),
  generateMemberNumber: vi.fn(),
  nanoid: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: hoisted.db,
  eq: vi.fn((left, right) => ({ left, right })),
  user: { id: 'user.id' },
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

    hoisted.nanoid.mockReturnValue('user_new');
    hoisted.generateMemberNumber.mockResolvedValue({
      memberNumber: 'MEM-2026-000123',
      isNew: true,
    });

    hoisted.db.transaction.mockImplementation(async callback => callback(hoisted.tx));

    hoisted.tx.insert.mockImplementation(() => ({
      values: hoisted.insertedUserValues,
    }));
    hoisted.insertedUserValues.mockResolvedValue(undefined);

    hoisted.tx.update.mockImplementation(() => ({
      set: hoisted.updatedUserValues,
    }));
    hoisted.updatedUserValues.mockReturnValue({
      where: () => ({
        returning: async () => [{ id: 'user_existing' }],
      }),
    });
  });

  it('creates a new member user from stored transaction payload and requests onboarding', async () => {
    hoisted.db.query.webhookEvents.findFirst.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'buyer@example.com',
          customData: {
            tenantId: 'tenant_mk',
            agentId: 'agent_9',
            acquisitionSource: 'self_serve_web',
            utmSource: 'google',
          },
        },
      },
    });
    hoisted.db.query.user.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'user_new',
        tenantId: 'tenant_mk',
        email: 'buyer@example.com',
        name: 'buyer',
        memberNumber: 'MEM-2026-000123',
      });
    hoisted.db.query.account.findFirst.mockResolvedValue(null);
    hoisted.db.query.tenantSettings.findFirst.mockResolvedValue({
      value: { branchId: 'branch-mk-main' },
    });

    const result = await reconcileCheckoutUser(
      {
        id: 'sub_new',
        transactionId: 'txn_123',
        customData: {
          tenantId: 'tenant_mk',
          agentId: 'agent_9',
        },
      },
      { requestPasswordResetOnboarding }
    );

    expect(hoisted.db.transaction).toHaveBeenCalledTimes(1);
    expect(hoisted.tx.insert).toHaveBeenCalled();
    expect(hoisted.generateMemberNumber).toHaveBeenCalledWith(hoisted.tx, {
      userId: 'user_new',
      joinedAt: expect.any(Date),
    });
    expect(requestPasswordResetOnboarding).toHaveBeenCalledWith({
      email: 'buyer@example.com',
      tenantId: 'tenant_mk',
    });
    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user_new',
        tenantId: 'tenant_mk',
        branchId: 'branch-mk-main',
        customData: expect.objectContaining({
          tenantId: 'tenant_mk',
          agentId: 'agent_9',
          acquisitionSource: 'self_serve_web',
          utmSource: 'google',
        }),
      })
    );
  });

  it('reuses an existing same-tenant user and skips onboarding when credentials already exist', async () => {
    hoisted.db.query.webhookEvents.findFirst.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'existing@example.com',
          customData: {
            tenantId: 'tenant_ks',
          },
        },
      },
    });
    hoisted.db.query.user.findFirst
      .mockResolvedValueOnce({
        id: 'user_existing',
        tenantId: 'tenant_ks',
        email: 'existing@example.com',
        name: 'Existing Member',
        memberNumber: 'MEM-2026-000001',
        role: 'member',
      })
      .mockResolvedValueOnce({
        id: 'user_existing',
        tenantId: 'tenant_ks',
        email: 'existing@example.com',
        name: 'Existing Member',
        memberNumber: 'MEM-2026-000001',
      });
    hoisted.db.query.account.findFirst.mockResolvedValue({
      id: 'acct_credential',
      providerId: 'credential',
    });
    hoisted.db.query.tenantSettings.findFirst.mockResolvedValue(undefined);

    const result = await reconcileCheckoutUser(
      {
        id: 'sub_existing',
        transactionId: 'txn_existing',
        customData: {
          tenantId: 'tenant_ks',
        },
      },
      { requestPasswordResetOnboarding }
    );

    expect(hoisted.db.transaction).not.toHaveBeenCalled();
    expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user_existing',
        tenantId: 'tenant_ks',
      })
    );
  });

  it('returns null when stored transaction payload tenant mismatches the existing user tenant', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    hoisted.db.query.webhookEvents.findFirst.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'wrong@example.com',
          customData: {
            tenantId: 'tenant_mk',
          },
        },
      },
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
    expect(hoisted.db.transaction).not.toHaveBeenCalled();
    expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('keeps the reconciled user context when onboarding email delivery fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    requestPasswordResetOnboarding.mockRejectedValueOnce(new Error('email offline'));

    hoisted.db.query.webhookEvents.findFirst.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'buyer@example.com',
          customData: {
            tenantId: 'tenant_mk',
          },
        },
      },
    });
    hoisted.db.query.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'user_new',
      tenantId: 'tenant_mk',
      email: 'buyer@example.com',
      name: 'buyer',
      memberNumber: 'MEM-2026-000123',
    });
    hoisted.db.query.account.findFirst.mockResolvedValue(null);
    hoisted.db.query.tenantSettings.findFirst.mockResolvedValue({
      value: { branchId: 'branch-mk-main' },
    });

    const result = await reconcileCheckoutUser(
      {
        id: 'sub_new',
        transactionId: 'txn_123',
        customData: {
          tenantId: 'tenant_mk',
        },
      },
      { requestPasswordResetOnboarding }
    );

    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user_new',
        tenantId: 'tenant_mk',
      })
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send onboarding password reset'),
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });

  it('reuses a raced same-tenant user when insert hits a unique violation', async () => {
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });

    hoisted.db.query.webhookEvents.findFirst.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'race@example.com',
          customData: {
            tenantId: 'tenant_mk',
          },
        },
      },
    });
    hoisted.db.query.user.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'user_race',
        tenantId: 'tenant_mk',
        branchId: 'branch-mk-main',
        email: 'race@example.com',
        name: 'Race Winner',
        memberNumber: 'MEM-2026-000777',
        role: 'member',
        agentId: null,
      })
      .mockResolvedValueOnce({
        id: 'user_race',
        tenantId: 'tenant_mk',
        branchId: 'branch-mk-main',
        email: 'race@example.com',
        name: 'Race Winner',
        memberNumber: 'MEM-2026-000777',
        role: 'member',
      });
    hoisted.db.query.account.findFirst.mockResolvedValue({
      id: 'acct_credential',
      providerId: 'credential',
    });
    hoisted.db.query.tenantSettings.findFirst.mockResolvedValue({
      value: { branchId: 'branch-mk-main' },
    });
    hoisted.insertedUserValues.mockRejectedValueOnce(uniqueViolation);

    const result = await reconcileCheckoutUser(
      {
        id: 'sub_race',
        transactionId: 'txn_race',
        customData: {
          tenantId: 'tenant_mk',
        },
      },
      { requestPasswordResetOnboarding }
    );

    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user_race',
        tenantId: 'tenant_mk',
      })
    );
    expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();
    expect(hoisted.generateMemberNumber).not.toHaveBeenCalled();
  });

  it('preserves elevated roles while still backfilling member state', async () => {
    hoisted.db.query.webhookEvents.findFirst.mockResolvedValue({
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
      })
    );
    expect(hoisted.generateMemberNumber).toHaveBeenCalledWith(hoisted.tx, {
      userId: 'user_admin',
      joinedAt: expect.any(Date),
    });
    expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();
  });
});
