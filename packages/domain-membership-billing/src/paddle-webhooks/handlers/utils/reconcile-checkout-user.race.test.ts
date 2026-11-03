import { installReconcileCheckoutUserHooks } from './reconcile-checkout-user.hooks.test-support';
import { hoisted } from './reconcile-checkout-user.test-support';
import { describe, expect, it, vi } from 'vitest';

import { TEST_PADDLE_DELIVERY } from '../../paddle-authority.test-support';
import { reconcileCheckoutUser } from './reconcile-checkout-user';

describe('reconcileCheckoutUser', () => {
  const requestPasswordResetOnboarding = vi.fn();

  installReconcileCheckoutUserHooks();

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
    hoisted.hasTenantMemberCredential.mockResolvedValue(true);
    hoisted.db.query.tenantSettings.findFirst.mockResolvedValue({
      value: { branchId: 'branch-mk-main' },
    });
    hoisted.insertedUserValues.mockRejectedValueOnce(uniqueViolation);

    const result = await reconcileCheckoutUser(
      TEST_PADDLE_DELIVERY,
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
    expect(hoisted.issueTenantMemberNumber).not.toHaveBeenCalled();
  });
});
