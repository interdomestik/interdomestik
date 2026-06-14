import type { RecoverySuccessFeeBillingSnapshot } from './paddle-success-fee-charge';

export type PaddleTransaction = {
  customData?: Record<string, unknown> | null;
  custom_data?: Record<string, unknown> | null;
  id: string;
  items?: Array<{
    price?: {
      customData?: Record<string, unknown> | null;
      custom_data?: Record<string, unknown> | null;
    } | null;
  }>;
};

type PaddleCustomDataCarrier = {
  customData?: Record<string, unknown> | null;
  custom_data?: Record<string, unknown> | null;
};

function transactionCustomData(carrier: PaddleCustomDataCarrier): Record<string, unknown> | null {
  return carrier.customData ?? carrier.custom_data ?? null;
}

function transactionCustomDataEntries(
  transaction: PaddleTransaction
): Array<Record<string, unknown>> {
  return [
    transactionCustomData(transaction),
    ...(transaction.items ?? []).map(item =>
      item.price ? transactionCustomData(item.price) : null
    ),
  ].filter((customData): customData is Record<string, unknown> => Boolean(customData));
}

export function transactionMatchesBillingEvent(params: {
  idempotencyKey: string;
  snapshot: RecoverySuccessFeeBillingSnapshot;
  transaction: PaddleTransaction;
}): boolean {
  return transactionCustomDataEntries(params.transaction).some(
    customData =>
      customData?.idempotencyKey === params.idempotencyKey &&
      customData?.tenantId === params.snapshot.tenantId
  );
}

export function requirePaddleTransactionId(
  transaction: Partial<PaddleTransaction> | undefined
): string {
  if (!transaction?.id) throw new Error('success-fee billing requires a Paddle transaction id');
  return transaction.id;
}
