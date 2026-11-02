import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  db: {
    query: {
      user: { findFirst: vi.fn() },
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
  authorizePaddleBillingTenant: vi.fn(),
  authorizePaddleTenant: vi.fn(),
  resolvePaddleCustomerEmailOwner: vi.fn(),
  readVerifiedPaddleTransactionEvidence: vi.fn(),
  insertedUserValues: vi.fn(),
  updatedUserValues: vi.fn(),
  issueTenantMemberNumber: vi.fn(),
  hasTenantMemberCredential: vi.fn(),
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
  hasTenantMemberCredential: hoisted.hasTenantMemberCredential,
  issueTenantMemberNumber: hoisted.issueTenantMemberNumber,
  eq: vi.fn((left, right) => ({ left, right })),
  user: { id: 'user.id' },
  withTenantContext: hoisted.withTenantContext,
  authorizePaddleBillingTenant: hoisted.authorizePaddleBillingTenant,
  authorizePaddleTenant: hoisted.authorizePaddleTenant,
  resolvePaddleCustomerEmailOwner: hoisted.resolvePaddleCustomerEmailOwner,
  readVerifiedPaddleTransactionEvidence: hoisted.readVerifiedPaddleTransactionEvidence,
}));

vi.mock('nanoid', () => ({
  nanoid: hoisted.nanoid,
}));

import {
  TEST_PADDLE_DELIVERY,
  authorizeAnyTestPaddleBillingTenant,
  createTestPaddleBillingProducer,
  authorizeTestPaddleOwner,
} from '../../paddle-authority.test-support';
import { isRetryablePaddleWebhookError } from '../../errors';
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
    hoisted.authorizePaddleBillingTenant.mockReset();
    hoisted.authorizePaddleBillingTenant.mockImplementation(authorizeAnyTestPaddleBillingTenant);
    hoisted.authorizePaddleTenant.mockReset();
    hoisted.authorizePaddleTenant.mockImplementation(authorizeTestPaddleOwner);
    vi.clearAllMocks();
    hoisted.db.query.user.findFirst.mockReset();
    hoisted.hasTenantMemberCredential.mockReset().mockResolvedValue(false);
    hoisted.readVerifiedPaddleTransactionEvidence.mockReset();
    hoisted.resolvePaddleCustomerEmailOwner.mockReset().mockResolvedValue(null);
    hoisted.db.query.tenantSettings.findFirst.mockReset();
    hoisted.db.transaction.mockReset();
    hoisted.tx.insert.mockReset();
    hoisted.tx.update.mockReset();
    hoisted.insertedUserValues.mockReset();
    hoisted.updatedUserValues.mockReset();
    hoisted.issueTenantMemberNumber.mockReset();
    hoisted.nanoid.mockReset();

    hoisted.nanoid.mockReturnValue('user_new');
    hoisted.issueTenantMemberNumber.mockResolvedValue({
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

  const counterDown = new Error('counter down');
  it.each([
    ['is refused', () => hoisted.issueTenantMemberNumber.mockResolvedValue(null), undefined],
    ['fails', () => hoisted.issueTenantMemberNumber.mockRejectedValue(counterDown), counterDown],
  ])(
    'fails reconciliation as retryable, for the receipt to be redelivered, when member-number issuance %s',
    async (_label, arrange, cause) => {
      hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
        payload: {
          data: { customerEmail: 'buyer@example.com', customData: { tenantId: 'tenant_mk' } },
        },
      });
      hoisted.db.query.user.findFirst.mockResolvedValue(null);
      hoisted.db.query.tenantSettings.findFirst.mockResolvedValue(undefined);
      arrange();

      await expect(
        reconcileCheckoutUser(
          TEST_PADDLE_DELIVERY,
          { id: 'sub_new', transactionId: 'txn_123', customData: { tenantId: 'tenant_mk' } },
          { requestPasswordResetOnboarding }
        )
      ).rejects.toSatisfy(
        error => isRetryablePaddleWebhookError(error) && (error as Error).cause === cause
      );
      expect(hoisted.insertedUserValues).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user_new', role: 'member' })
      );
      expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();
    }
  );

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
    hoisted.hasTenantMemberCredential.mockResolvedValue(false);
    hoisted.db.query.tenantSettings.findFirst.mockResolvedValue({
      value: { branchId: 'branch-mk-main' },
    });

    const result = await reconcileCheckoutUser(
      TEST_PADDLE_DELIVERY,
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

    // Every effect runs under the billing authority for the entity-bound tenant, minted from the
    // evidence tenant only because it equals the binding.
    expect(hoisted.authorizePaddleBillingTenant).toHaveBeenCalledWith(
      TEST_PADDLE_DELIVERY,
      'tenant_mk'
    );
    const billingAuthority = hoisted.authorizePaddleBillingTenant.mock.results[0]!.value;
    expect(readTenantAuthority(billingAuthority).tenantId).toBe('tenant_mk');
    expect(hoisted.withTenantContext).toHaveBeenCalled();
    for (const [context] of hoisted.withTenantContext.mock.calls) {
      expect(context).toBe(billingAuthority);
    }
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
    expect(hoisted.issueTenantMemberNumber).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user_new',
      joinedAt: expect.any(Date),
    });
    // Both identity producers run under the billing authority of the reconciled tenant, after
    // the tenant transaction that created the member.
    const [issuedAuthority] = hoisted.issueTenantMemberNumber.mock.calls[0];
    expect(readTenantAuthority(issuedAuthority).tenantId).toBe('tenant_mk');
    expect(hoisted.hasTenantMemberCredential).toHaveBeenCalledWith(issuedAuthority, 'user_new');
    expect(hoisted.withTenantContext.mock.invocationCallOrder[1]).toBeLessThan(
      hoisted.issueTenantMemberNumber.mock.invocationCallOrder[0]
    );
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
    hoisted.hasTenantMemberCredential.mockResolvedValue(true);
    hoisted.db.query.tenantSettings.findFirst.mockResolvedValue(undefined);

    const result = await reconcileCheckoutUser(
      TEST_PADDLE_DELIVERY,
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
    // The owner's full record is read under the authority minted from the exact owner object.
    const emailOwner = await hoisted.resolvePaddleCustomerEmailOwner.mock.results[0]!.value;
    expect(hoisted.authorizePaddleTenant).toHaveBeenCalledWith(TEST_PADDLE_DELIVERY, emailOwner);
    expect(hoisted.authorizePaddleTenant.mock.calls[0]![1]).toBe(emailOwner);
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      hoisted.authorizePaddleTenant.mock.results[0]!.value,
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
  describe('billing binding', () => {
    const evidence = (tenantId: string) => ({
      payload: {
        data: {
          customerEmail: 'buyer@example.com',
          customData: { tenantId, agentId: 'agent_9' },
        },
      },
    });
    const subscription = (tenantId: string) => ({
      id: 'sub_new',
      transactionId: 'txn_123',
      customData: { tenantId },
    });

    it('cannot reconcile on an unbound delivery: warns, returns null and touches nothing', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      hoisted.authorizePaddleBillingTenant.mockImplementation(
        createTestPaddleBillingProducer(null)
      );
      hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue(evidence('tenant_mk'));

      const result = await reconcileCheckoutUser(TEST_PADDLE_DELIVERY, subscription('tenant_mk'), {
        requestPasswordResetOnboarding,
      });

      expect(result).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('entity-bound delivery'));
      expect(hoisted.resolvePaddleCustomerEmailOwner).not.toHaveBeenCalled();
      expect(hoisted.withTenantContext).not.toHaveBeenCalled();
      expect(hoisted.tx.insert).not.toHaveBeenCalled();
      expect(hoisted.tx.update).not.toHaveBeenCalled();
      expect(hoisted.issueTenantMemberNumber).not.toHaveBeenCalled();
      expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('cannot act for another billing tenant than the delivery binding (customData tenant mismatch)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      hoisted.authorizePaddleBillingTenant.mockImplementation(
        createTestPaddleBillingProducer('tenant_ks')
      );
      hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue(evidence('tenant_mk'));

      const result = await reconcileCheckoutUser(TEST_PADDLE_DELIVERY, subscription('tenant_mk'), {
        requestPasswordResetOnboarding,
      });

      expect(result).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('billing tenant of this delivery'));
      expect(hoisted.withTenantContext).not.toHaveBeenCalled();
      expect(hoisted.tx.insert).not.toHaveBeenCalled();
      expect(hoisted.tx.update).not.toHaveBeenCalled();
      expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
