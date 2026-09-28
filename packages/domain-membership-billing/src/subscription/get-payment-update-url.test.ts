import { describe, expect, it, vi } from 'vitest';
import {
  getPaymentUpdateUrlCore,
  hoisted,
  TRUSTED_LINK,
  TRANSACTION_ID,
  VALID_SUB,
  session,
  setupPaymentUpdateUrlHarness,
} from './__tests__/get-payment-update-url-harness';

describe('getPaymentUpdateUrlCore', () => {
  setupPaymentUpdateUrlHarness();

  it('returns Unauthorized and makes no provider call when there is no session', async () => {
    const result = await getPaymentUpdateUrlCore({
      session: null,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'Unauthorized', url: undefined });
    expect(hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '', 'agent', 'staff', 'admin', 'super_admin'])(
    'denies a non-member session role (%s) and makes no provider call',
    async role => {
      const result = await getPaymentUpdateUrlCore({
        session: { user: { id: 'user_123', role: role as never } },
        subscriptionId: VALID_SUB.id,
      });

      expect(result).toEqual({ error: 'Unauthorized', url: undefined });
      expect(hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction).not.toHaveBeenCalled();
    }
  );

  it.each(['member', 'user'])(
    'allows the canonical member role %s through the role gate',
    async role => {
      hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);

      const result = await getPaymentUpdateUrlCore({
        session: { user: { id: 'user_123', role } },
        subscriptionId: VALID_SUB.id,
      });

      expect(result.error).toBeUndefined();
      expect(result.url).toBe(`${TRUSTED_LINK}?_ptxn=${TRANSACTION_ID}`);
    }
  );

  it('denies a subscription owned by a different member', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      ...VALID_SUB,
      userId: 'someone_else',
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'Subscription not found or access denied', url: undefined });
    expect(hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction).not.toHaveBeenCalled();
  });

  it('denies when the subscription row is not found for the tenant-scoped query', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: 'cross_tenant_sub',
    });

    expect(result).toEqual({ error: 'Subscription not found or access denied', url: undefined });
    expect(hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction).not.toHaveBeenCalled();
  });

  it('denies when the loaded row tenantId does not match the ensured session tenantId, even if the query mock is wrong', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      ...VALID_SUB,
      tenantId: 'tenant_mk',
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'Subscription not found or access denied', url: undefined });
    expect(hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction).not.toHaveBeenCalled();
  });

  it('denies when the subscription is not on the paddle provider', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      ...VALID_SUB,
      provider: 'stripe',
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({
      error: 'Subscription is not managed by the payment provider',
      url: undefined,
    });
    expect(hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction).not.toHaveBeenCalled();
  });

  it.each(['canceled', 'paused', 'trialing', 'expired'])(
    'denies status %s as ineligible for payment recovery',
    async status => {
      hoisted.db.query.subscriptions.findFirst.mockResolvedValue({ ...VALID_SUB, status });

      const result = await getPaymentUpdateUrlCore({
        session,
        subscriptionId: VALID_SUB.id,
      });

      expect(result).toEqual({
        error: 'Subscription is not eligible for payment method recovery',
        url: undefined,
      });
      expect(hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction).not.toHaveBeenCalled();
    }
  );

  it.each([null, '', 'not-a-paddle-id', 'sub_tooshort', 'mock_sub_internal'])(
    'does not fall back to an unverified provider subscription id (%s)',
    async providerSubscriptionId => {
      hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
        ...VALID_SUB,
        providerSubscriptionId,
      });

      const result = await getPaymentUpdateUrlCore({
        session,
        subscriptionId: VALID_SUB.id,
      });

      expect(result).toEqual({
        error: 'Subscription is not linked to a verified provider reference',
        url: undefined,
      });
      expect(hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction).not.toHaveBeenCalled();
    }
  );

  it.each([null, '', 'not-a-paddle-customer-id', 'ctm_tooshort'])(
    'denies when the stored provider customer id %s is missing or malformed',
    async providerCustomerId => {
      hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
        ...VALID_SUB,
        providerCustomerId,
      });

      const result = await getPaymentUpdateUrlCore({
        session,
        subscriptionId: VALID_SUB.id,
      });

      expect(result).toEqual({
        error: 'Subscription is missing a verified provider customer reference',
        url: undefined,
      });
      expect(hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction).not.toHaveBeenCalled();
    }
  );

  it('fails closed when the approved payment update link is not configured', async () => {
    delete process.env.PADDLE_DEFAULT_PAYMENT_LINK_KS;
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'Payment update is not available right now', url: undefined });
    expect(hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction).not.toHaveBeenCalled();
  });

  it('fails closed when the approved payment update link carries a query or credentials', async () => {
    process.env.PADDLE_DEFAULT_PAYMENT_LINK_KS = 'https://user:pass@pay.ks.example.test/checkout';
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'Payment update is not available right now', url: undefined });
    expect(hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction).not.toHaveBeenCalled();
  });
});
