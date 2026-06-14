import {
  requirePaddleTransactionId,
  transactionMatchesBillingEvent,
  type PaddleTransaction,
} from './paddle-transaction-idempotency';
import {
  buildPaddleInvoiceTransactionRequest,
  buildPaddleSubscriptionChargeRequest,
} from './paddle-success-fee-request';
import type { BillingEntity } from '../paddle-server';

export type RecoverySuccessFeeCollectionMethod = 'deduction' | 'payment_method_charge' | 'invoice';

export type RecoverySuccessFeeBillingSnapshot = Readonly<{
  claimId: string;
  billingEntity: BillingEntity;
  collectionMethod: RecoverySuccessFeeCollectionMethod;
  currencyCode: string;
  feeAmount: string;
  invoiceDueAt: Date | null;
  paymentAuthorizationState: 'pending' | 'authorized' | 'revoked';
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  recoveryLegalTenantId: string;
  subscriptionBillingEntity: BillingEntity | null;
  tenantId: string;
}>;

export type PaddleSuccessFeeClient = {
  subscriptions: {
    createOneTimeCharge(subscriptionId: string, input: Record<string, unknown>): Promise<unknown>;
  };
  transactions: {
    create(input: Record<string, unknown>): Promise<Partial<PaddleTransaction> | undefined>;
    list(input: Record<string, unknown>): AsyncIterable<PaddleTransaction>;
  };
};

export type PaddleSuccessFeeBillingResult =
  | { status: 'paddle_invoice_billed'; providerTransactionId: string }
  | { status: 'paddle_subscription_charge_created'; providerSubscriptionId: string }
  | { status: 'paddle_transaction_reused'; providerTransactionId: string }
  | { status: 'skipped_deduction' };

function assertBillableSnapshot(snapshot: RecoverySuccessFeeBillingSnapshot) {
  if (snapshot.collectionMethod === 'payment_method_charge') {
    if (!snapshot.providerCustomerId) {
      throw new Error('success-fee billing requires a Paddle customer before delivery');
    }
    if (snapshot.paymentAuthorizationState !== 'authorized') {
      throw new Error('success-fee billing requires authorized payment collection');
    }
    if (!snapshot.providerSubscriptionId) {
      throw new Error('success-fee billing requires a subscription payment handle');
    }
  }
  if (snapshot.collectionMethod === 'invoice' && !snapshot.invoiceDueAt) {
    throw new Error('success-fee invoice billing requires an invoice due date');
  }
}

async function findExistingSuccessFeeTransaction(params: {
  idempotencyKey: string;
  paddle: PaddleSuccessFeeClient;
  providerCustomerId: string | null;
  snapshot: RecoverySuccessFeeBillingSnapshot;
}): Promise<PaddleTransaction | null> {
  const transactions = params.paddle.transactions.list({
    ...(params.providerCustomerId ? { customerId: [params.providerCustomerId] } : {}),
    orderBy: '-created_at',
    perPage: 50,
  });

  for await (const transaction of transactions) {
    if (
      transactionMatchesBillingEvent({
        idempotencyKey: params.idempotencyKey,
        snapshot: params.snapshot,
        transaction,
      })
    ) {
      return transaction;
    }
  }
  return null;
}

export async function createPaddleSuccessFeeTransaction(params: {
  idempotencyKey: string;
  now?: Date;
  paddle: PaddleSuccessFeeClient;
  snapshot: RecoverySuccessFeeBillingSnapshot;
}): Promise<PaddleSuccessFeeBillingResult> {
  if (params.snapshot.collectionMethod === 'deduction') {
    return { status: 'skipped_deduction' };
  }
  assertBillableSnapshot(params.snapshot);

  const existing = await findExistingSuccessFeeTransaction({
    idempotencyKey: params.idempotencyKey,
    paddle: params.paddle,
    providerCustomerId: params.snapshot.providerCustomerId,
    snapshot: params.snapshot,
  });
  if (existing) {
    return {
      providerTransactionId: requirePaddleTransactionId(existing),
      status: 'paddle_transaction_reused',
    };
  }

  if (params.snapshot.collectionMethod === 'payment_method_charge') {
    const providerSubscriptionId = params.snapshot.providerSubscriptionId;
    if (!providerSubscriptionId) {
      throw new Error('success-fee billing requires a subscription payment handle');
    }
    await params.paddle.subscriptions.createOneTimeCharge(
      providerSubscriptionId,
      buildPaddleSubscriptionChargeRequest(params.snapshot, params.idempotencyKey)
    );
    return {
      providerSubscriptionId,
      status: 'paddle_subscription_charge_created',
    };
  }

  const transaction = await params.paddle.transactions.create(
    buildPaddleInvoiceTransactionRequest(
      params.snapshot,
      params.idempotencyKey,
      params.now ?? new Date()
    )
  );
  return {
    providerTransactionId: requirePaddleTransactionId(transaction),
    status: 'paddle_invoice_billed',
  };
}
