import { afterEach, beforeEach, vi, type Mock } from 'vitest';
import type { SubscriptionSession } from '../types';

type PaymentUpdateTestMocks = {
  db: { query: { subscriptions: { findFirst: Mock } } };
  subscriptions: { id: string; tenantId: string };
  ensureTenantId: Mock;
  resolveBillingEntityForTenantId: Mock;
  paddle: { subscriptions: { getPaymentMethodChangeTransaction: Mock } };
};

export const hoisted: PaymentUpdateTestMocks = {
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
};

vi.doMock('@interdomestik/database', () => ({
  db: hoisted.db,
  subscriptions: hoisted.subscriptions,
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.doMock('@interdomestik/shared-auth', () => ({
  ensureTenantId: hoisted.ensureTenantId,
}));

vi.doMock('../../paddle-server', () => ({
  getPaddle: () => hoisted.paddle,
  resolveBillingEntityForTenantId: hoisted.resolveBillingEntityForTenantId,
}));

export const TRUSTED_LINK = 'https://pay.ks.example.test/checkout/default';

export const PROVIDER_SUBSCRIPTION_ID = 'sub_' + 'a'.repeat(26);
export const PROVIDER_CUSTOMER_ID = 'ctm_' + 'b'.repeat(26);
export const TRANSACTION_ID = 'txn_' + 'c'.repeat(26);

export const VALID_SUB = {
  id: 'mock_sub_internal',
  status: 'past_due',
  provider: 'paddle',
  providerSubscriptionId: PROVIDER_SUBSCRIPTION_ID,
  providerCustomerId: PROVIDER_CUSTOMER_ID,
  userId: 'user_123',
  tenantId: 'tenant_ks',
};

export const VALID_TRANSACTION = {
  id: TRANSACTION_ID,
  subscriptionId: VALID_SUB.providerSubscriptionId,
  customerId: VALID_SUB.providerCustomerId,
  collectionMode: 'automatic',
  status: 'past_due',
  origin: 'subscription_recurring',
  checkout: { url: `${TRUSTED_LINK}?_ptxn=${TRANSACTION_ID}` },
};

export const session: SubscriptionSession = { user: { id: 'user_123', role: 'member' } };

export const { getPaymentUpdateUrlCore } = await import('../get-payment-update-url');

export function setupPaymentUpdateUrlHarness() {
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
}
