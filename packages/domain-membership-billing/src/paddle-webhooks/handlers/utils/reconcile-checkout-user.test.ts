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

  it('creates a new member user from stored transaction payload and requests onboarding', async () => {
    hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
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
    // No tenant owns the email (privileged probe); the reads below are the agent branch lookup and
    // the final reload.
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
          agentId: 'agent_9',
        },
      },
      { requestPasswordResetOnboarding }
    );

    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant_mk' },
      expect.any(Function)
    );
    expect(hoisted.tx.insert).toHaveBeenCalledTimes(1);
    expect(hoisted.tx.insert).toHaveBeenCalled();
    expect(hoisted.insertedUserValues).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'member',
        agentId: 'agent_9',
        createdBy: 'self',
        assistedByAgentId: 'agent_9',
      })
    );
    expect(insertedUserValuesInclude({ memberId: 'user_new', status: 'active' })).toBe(false);
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
    hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'existing@example.com',
          customData: {
            tenantId: 'tenant_ks',
          },
        },
      },
    });
    hoisted.resolvePaddleCustomerEmailOwner.mockResolvedValue({
      userId: 'user_existing',
      tenantId: 'tenant_ks',
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

    expect(hoisted.resolvePaddleCustomerEmailOwner).toHaveBeenCalledWith('existing@example.com');
    // The owner's full record is read inside the owning tenant, never through an ambient read.
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant_ks' },
      expect.any(Function)
    );
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(hoisted.tx.update).not.toHaveBeenCalled();
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

  it('keeps the reconciled user context when onboarding email delivery fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    requestPasswordResetOnboarding.mockRejectedValueOnce(new Error('email offline'));

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
    hoisted.db.query.user.findFirst.mockResolvedValueOnce({
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

    hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'race@example.com',
          customData: {
            tenantId: 'tenant_mk',
          },
        },
      },
    });
    // First probe: nobody owns the email yet. After the unique violation the winner owns it.
    hoisted.resolvePaddleCustomerEmailOwner
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: 'user_race', tenantId: 'tenant_mk' });
    hoisted.db.query.user.findFirst
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
