import { hoisted } from './reconcile-checkout-user.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TEST_PADDLE_DELIVERY,
  authorizeAnyTestPaddleBillingTenant,
  createTestPaddleBillingProducer,
  authorizeTestPaddleOwner,
} from '../../paddle-authority.test-support';
import { reconcileCheckoutUser } from './reconcile-checkout-user';

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
