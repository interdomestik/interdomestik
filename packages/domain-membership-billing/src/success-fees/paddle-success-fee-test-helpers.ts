import { vi, type Mock } from 'vitest';

import type {
  PaddleSuccessFeeClient,
  RecoverySuccessFeeBillingSnapshot,
} from './paddle-success-fee-charge';
import type { PaddleTransaction } from './paddle-transaction-idempotency';

export const SUCCESS_FEE_IDEMPOTENCY_KEY = 'domain-event:billing:event-1';

export type PaddleSuccessFeeClientMock = PaddleSuccessFeeClient & {
  subscriptions: { createOneTimeCharge: Mock };
  transactions: { create: Mock; list: Mock };
};

type DbTableProxy = Record<string, string>;

export type RecoverySuccessFeeDbMocks = {
  and: Mock;
  claims: DbTableProxy;
  claimEscalationAgreements: DbTableProxy;
  domainEventDeliveries: DbTableProxy;
  domainEventDeliveryIdempotencyKey: Mock;
  domainEvents: DbTableProxy;
  eq: Mock;
  recordDomainEventDelivery: Mock;
  selectDomainEventsForRelay: Mock;
  sql: Mock;
  subscriptions: DbTableProxy;
};

export async function* paddleTransactions(rows: PaddleTransaction[]) {
  yield* rows;
}

export function createRecoverySuccessFeeDbMocks(): RecoverySuccessFeeDbMocks {
  const table = (name: string): DbTableProxy =>
    new Proxy({}, { get: (_target, prop) => `${name}.${String(prop)}` });
  return {
    and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
    claims: table('claims'),
    claimEscalationAgreements: table('agreement'),
    domainEventDeliveries: table('deliveries'),
    domainEventDeliveryIdempotencyKey: vi.fn(
      (eventId: string, consumerName = 'billing') => `domain-event:${consumerName}:${eventId}`
    ),
    domainEvents: table('events'),
    eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
    recordDomainEventDelivery: vi.fn(),
    selectDomainEventsForRelay: vi.fn(),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
    subscriptions: table('subscriptions'),
  };
}

export function successFeeCollectedEvent(
  overrides: Record<string, unknown> = {},
  payloadOverrides: Record<string, unknown> = {}
) {
  return {
    aggregateVersion: 1,
    createdAt: new Date('2026-06-01T10:00:00Z'),
    entityId: 'claim-1',
    entityType: 'claim',
    eventName: 'recovery.success_fee_collected',
    eventVersion: 1,
    id: 'event-1',
    payload: {
      collectionMethod: 'payment_method_charge',
      currencyCode: 'EUR',
      deductionAllowed: false,
      hasInvoiceDueDate: false,
      hasStoredPaymentMethod: true,
      paymentAuthorizationState: 'authorized',
      ...payloadOverrides,
    },
    tenantId: 'tenant_ks',
    ...overrides,
  };
}

export function paddleMock(
  params: {
    create?: Mock;
    createOneTimeCharge?: Mock;
    rows?: PaddleTransaction[];
  } = {}
): PaddleSuccessFeeClientMock {
  return {
    subscriptions: {
      createOneTimeCharge:
        params.createOneTimeCharge ?? vi.fn().mockResolvedValue({ id: 'sub_123' }),
    },
    transactions: {
      create: params.create ?? vi.fn().mockResolvedValue({ id: 'txn_123' }),
      list: vi.fn(() => paddleTransactions(params.rows ?? [])),
    },
  };
}

export function paymentMethodSnapshot(
  overrides: Partial<RecoverySuccessFeeBillingSnapshot> = {}
): RecoverySuccessFeeBillingSnapshot {
  return {
    billingEntity: 'ks',
    claimId: 'claim-1',
    collectionMethod: 'payment_method_charge',
    currencyCode: 'EUR',
    feeAmount: '15.50',
    invoiceDueAt: null,
    paymentAuthorizationState: 'authorized',
    providerCustomerId: 'ctm_123',
    providerSubscriptionId: 'sub_123',
    recoveryLegalTenantId: 'tenant_ks',
    subscriptionBillingEntity: 'ks',
    tenantId: 'tenant_ks',
    ...overrides,
  };
}

export function invoiceSnapshot(
  overrides: Partial<RecoverySuccessFeeBillingSnapshot> = {}
): RecoverySuccessFeeBillingSnapshot {
  return paymentMethodSnapshot({
    collectionMethod: 'invoice',
    invoiceDueAt: new Date('2026-07-01'),
    paymentAuthorizationState: 'pending',
    providerCustomerId: null,
    providerSubscriptionId: null,
    ...overrides,
  });
}
