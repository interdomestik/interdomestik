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
});
