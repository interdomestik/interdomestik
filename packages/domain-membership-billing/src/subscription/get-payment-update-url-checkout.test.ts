import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPaymentUpdateUrlCore } from './get-payment-update-url';
import type { SubscriptionSession } from './types';

const hoisted = vi.hoisted(() => ({
  db: {
    query: {
      subscriptions: { findFirst: vi.fn() },
    },
  },
  subscriptions: { id: 'id', tenantId: 'tenantId' },
  ensureTenantId: vi.fn(),
  resolveBillingEntityForTenantId: vi.fn(),
  paddle: {
    subscriptions: {
      getPaymentMethodChangeTransaction: vi.fn(),
    },
  },
}));

vi.mock('@interdomestik/database', () => ({
  db: hoisted.db,
  subscriptions: hoisted.subscriptions,
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: hoisted.ensureTenantId,
}));

vi.mock('../paddle-server', () => ({
  getPaddle: () => hoisted.paddle,
  resolveBillingEntityForTenantId: hoisted.resolveBillingEntityForTenantId,
}));

const TRUSTED_LINK = 'https://pay.ks.example.test/checkout/default';
const TRUSTED_ORIGIN = 'https://pay.ks.example.test';
const OTHER_ORIGIN = 'https://attacker.example.test';

const PROVIDER_SUBSCRIPTION_ID = 'sub_' + 'a'.repeat(26);
const PROVIDER_CUSTOMER_ID = 'ctm_' + 'b'.repeat(26);
const TRANSACTION_ID = 'txn_' + 'c'.repeat(26);

const VALID_SUB = {
  id: 'mock_sub_internal',
  status: 'past_due',
  provider: 'paddle',
  providerSubscriptionId: PROVIDER_SUBSCRIPTION_ID,
  providerCustomerId: PROVIDER_CUSTOMER_ID,
  userId: 'user_123',
  tenantId: 'tenant_ks',
};

const VALID_TRANSACTION = {
  id: TRANSACTION_ID,
  subscriptionId: VALID_SUB.providerSubscriptionId,
  customerId: VALID_SUB.providerCustomerId,
  collectionMode: 'automatic',
  status: 'past_due',
  origin: 'subscription_recurring',
  checkout: { url: `${TRUSTED_LINK}?_ptxn=${TRANSACTION_ID}` },
};

const session: SubscriptionSession = { user: { id: 'user_123', role: 'member' } };

describe('getPaymentUpdateUrlCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.PADDLE_DEFAULT_PAYMENT_LINK_KS = TRUSTED_LINK;
    delete process.env.PADDLE_DEFAULT_PAYMENT_LINK_MK;
    delete process.env.PADDLE_DEFAULT_PAYMENT_LINK_AL;

    hoisted.ensureTenantId.mockReturnValue('tenant_ks');
    hoisted.resolveBillingEntityForTenantId.mockReturnValue('ks');
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue(
      VALID_TRANSACTION
    );
  });

  afterEach(() => {
    delete process.env.PADDLE_DEFAULT_PAYMENT_LINK_KS;
    delete process.env.PADDLE_DEFAULT_PAYMENT_LINK_MK;
    delete process.env.PADDLE_DEFAULT_PAYMENT_LINK_AL;
    vi.restoreAllMocks();
  });

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
