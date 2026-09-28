import { describe, expect, it, vi } from 'vitest';
import {
  getPaymentUpdateUrlCore,
  hoisted,
  TRUSTED_LINK,
  PROVIDER_SUBSCRIPTION_ID,
  TRANSACTION_ID,
  VALID_SUB,
  VALID_TRANSACTION,
  session,
  setupPaymentUpdateUrlHarness,
} from './__tests__/get-payment-update-url-harness';

describe('getPaymentUpdateUrlCore', () => {
  setupPaymentUpdateUrlHarness();

  it('rejects a checkout url carrying embedded credentials', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      checkout: {
        url: `https://user:pass@pay.ks.example.test/checkout/default?_ptxn=${TRANSACTION_ID}`,
      },
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'No checkout URL generated', url: undefined });
  });

  it('rejects a checkout url carrying a fragment', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      checkout: { url: `${TRUSTED_LINK}?_ptxn=${TRANSACTION_ID}#skip` },
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'No checkout URL generated', url: undefined });
  });

  it('rejects a non-https checkout url', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      checkout: { url: `http://pay.ks.example.test/checkout/default?_ptxn=${TRANSACTION_ID}` },
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'No checkout URL generated', url: undefined });
  });

  it('returns a safe result and never logs the raw provider error (which may carry secrets)', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    const secretError = new Error('Paddle API key invalid: sk_live_super_secret_token');
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockRejectedValue(secretError);
    const errorSpy = vi.spyOn(console, 'error');

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'Failed to generate update link', url: undefined });
    expect(result.error).not.toContain('sk_live_super_secret_token');

    for (const call of errorSpy.mock.calls) {
      for (const arg of call) {
        expect(String(arg)).not.toContain('sk_live_super_secret_token');
        expect(arg).not.toBe(secretError);
      }
    }
  });

  it('returns the verified checkout url for a valid past_due recovery request', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({
      error: undefined,
      url: `${TRUSTED_LINK}?_ptxn=${TRANSACTION_ID}`,
    });
    expect(hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction).toHaveBeenCalledWith(
      PROVIDER_SUBSCRIPTION_ID
    );
  });

  it('returns the verified zero-value method-change link for an active member', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      ...VALID_SUB,
      status: 'active',
    });
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      status: 'ready',
      origin: 'subscription_payment_method_change',
      details: { totals: { total: '0' } },
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({
      error: undefined,
      url: `${TRUSTED_LINK}?_ptxn=${TRANSACTION_ID}`,
    });
  });

  it.each([
    { status: 'past_due', origin: 'subscription_recurring', total: '0' },
    { status: 'ready', origin: 'subscription_recurring', total: '0' },
    { status: 'ready', origin: 'subscription_payment_method_change', total: '100' },
    { status: 'ready', origin: 'subscription_payment_method_change', total: null },
  ])(
    'denies active payment updates with inconsistent provider evidence: $status/$origin/$total',
    async evidence => {
      hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
        ...VALID_SUB,
        status: 'active',
      });
      hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
        ...VALID_TRANSACTION,
        status: evidence.status,
        origin: evidence.origin,
        details: { totals: evidence.total === null ? null : { total: evidence.total } },
      });

      const result = await getPaymentUpdateUrlCore({ session, subscriptionId: VALID_SUB.id });

      expect(result).toEqual({
        error: 'Payment update transaction is not in a usable state',
        url: undefined,
      });
    }
  );
});
