import { installReconcileCheckoutUserHooks } from './reconcile-checkout-user.hooks.test-support';
import { hoisted } from './reconcile-checkout-user.test-support';
import { describe, expect, it, vi } from 'vitest';

import { TEST_PADDLE_DELIVERY } from '../../paddle-authority.test-support';
import { reconcileCheckoutUser } from './reconcile-checkout-user';

describe('reconcileCheckoutUser', () => {
  const requestPasswordResetOnboarding = vi.fn();

  installReconcileCheckoutUserHooks();

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
      TEST_PADDLE_DELIVERY,
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
      TEST_PADDLE_DELIVERY,
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
      TEST_PADDLE_DELIVERY,
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
      TEST_PADDLE_DELIVERY,
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
