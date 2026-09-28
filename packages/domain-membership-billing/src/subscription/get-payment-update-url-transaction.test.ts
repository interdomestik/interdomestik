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

  it('denies when the provider transaction targets a different subscription', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      subscriptionId: 'sub_' + 'z'.repeat(26),
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({
      error: 'Payment update transaction did not match this subscription',
      url: undefined,
    });
  });

  it('denies when the provider transaction targets a different customer', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      customerId: 'ctm_' + 'y'.repeat(26),
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({
      error: 'Payment update transaction did not match this member',
      url: undefined,
    });
  });

  it('denies when the transaction is not on automatic collection', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      collectionMode: 'manual',
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({
      error: 'Payment update is only available for automatic billing',
      url: undefined,
    });
  });

  it.each(['draft', 'ready', 'billed', 'paid', 'completed', 'canceled', '', null])(
    'denies transactions in a non-recoverable status (%s)',
    async status => {
      hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
      hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
        ...VALID_TRANSACTION,
        status,
      });

      const result = await getPaymentUpdateUrlCore({
        session,
        subscriptionId: VALID_SUB.id,
      });

      expect(result).toEqual({
        error: 'Payment update transaction is not in a usable state',
        url: undefined,
      });
    }
  );

  it('rejects a provider-returned transaction id that is not a valid Paddle id', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      id: 'not-a-real-txn-id',
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'No checkout URL generated', url: undefined });
  });

  it('rejects a checkout url on an untrusted origin', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      checkout: { url: `${OTHER_ORIGIN}/checkout/default?_ptxn=${TRANSACTION_ID}` },
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'No checkout URL generated', url: undefined });
  });

  it('rejects a checkout url on the trusted origin but the wrong path', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      checkout: { url: `${TRUSTED_ORIGIN}/attacker/redirect?_ptxn=${TRANSACTION_ID}` },
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'No checkout URL generated', url: undefined });
  });

  it('rejects a checkout url whose _ptxn does not match the verified transaction id', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      checkout: { url: `${TRUSTED_LINK}?_ptxn=txn_${'d'.repeat(26)}` },
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'No checkout URL generated', url: undefined });
  });

  it('rejects a checkout url with a duplicated _ptxn parameter', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      checkout: { url: `${TRUSTED_LINK}?_ptxn=${TRANSACTION_ID}&_ptxn=${TRANSACTION_ID}` },
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'No checkout URL generated', url: undefined });
  });

  it('rejects a checkout url carrying an extra ambiguous query parameter', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      checkout: {
        url: `${TRUSTED_LINK}?_ptxn=${TRANSACTION_ID}&redirect=https://evil.example`,
      },
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'No checkout URL generated', url: undefined });
  });
});
