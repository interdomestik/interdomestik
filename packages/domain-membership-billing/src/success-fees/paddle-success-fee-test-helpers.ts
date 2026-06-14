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

export async function* paddleTransactions(rows: PaddleTransaction[]) {
  yield* rows;
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
    claimId: 'claim-1',
    collectionMethod: 'payment_method_charge',
    currencyCode: 'EUR',
    feeAmount: '15.50',
    invoiceDueAt: null,
    paymentAuthorizationState: 'authorized',
    providerCustomerId: 'ctm_123',
    providerSubscriptionId: 'sub_123',
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
