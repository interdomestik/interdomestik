type OrderItem = {
  price?: { id?: string | null } | null;
  priceId?: string | null;
  price_id?: string | null;
  quantity?: number | null;
  totals?: { total?: string | null } | null;
};

export type SubscriptionOrderPayload = {
  id?: string | null;
  transactionId?: string | null;
  transaction_id?: string | null;
  customerId?: string | null;
  customer_id?: string | null;
  currencyCode?: string | null;
  currency_code?: string | null;
  items?: OrderItem[] | null;
};

export type TransactionOrderPayload = {
  id?: string | null;
  transactionId?: string | null;
  transaction_id?: string | null;
  status?: string | null;
  subscriptionId?: string | null;
  subscription_id?: string | null;
  customerId?: string | null;
  customer_id?: string | null;
  currencyCode?: string | null;
  currency_code?: string | null;
  details?: {
    totals?: {
      total?: string | null;
      currencyCode?: string | null;
      currency_code?: string | null;
    } | null;
    lineItems?: OrderItem[] | null;
    line_items?: OrderItem[] | null;
  } | null;
};

type IntegrityFailureReason =
  | 'missing_transaction_id'
  | 'transaction_mismatch'
  | 'transaction_not_completed'
  | 'subscription_mismatch'
  | 'customer_mismatch'
  | 'currency_mismatch'
  | 'order_mismatch'
  | 'amount_mismatch';

export type CheckoutOrderIntegrityResult =
  | {
      ok: true;
      authority: {
        transactionId: string;
        customerId: string;
        amount: string;
        currencyCode: string;
      };
    }
  | { ok: false; reason: IntegrityFailureReason };

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeCurrency(value: string | null | undefined): string | null {
  const normalized = normalizeText(value)?.toUpperCase();
  return normalized && /^[A-Z]{3}$/u.test(normalized) ? normalized : null;
}

function normalizeMinorAmount(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  return normalized && /^\d+$/u.test(normalized) ? normalized : null;
}

function resolveOrderItems(items: OrderItem[] | null | undefined): string[] | null {
  if (!items || items.length === 0) return null;

  const normalized = items.map(item => {
    const priceId = normalizeText(item.price?.id || item.priceId || item.price_id);
    const quantity = item.quantity;
    if (!priceId || !Number.isSafeInteger(quantity) || Number(quantity) <= 0) return null;
    return `${priceId}:${quantity}`;
  });

  return normalized.every((item): item is string => item !== null)
    ? normalized.sort((left, right) => left.localeCompare(right))
    : null;
}

function lineItemTotal(items: OrderItem[] | null | undefined): string | null {
  if (!items || items.length === 0) return null;
  let total = 0n;
  for (const item of items) {
    const amount = normalizeMinorAmount(item.totals?.total);
    if (!amount) return null;
    total += BigInt(amount);
  }
  return total.toString();
}

export function validateCheckoutOrderIntegrity(
  subscription: SubscriptionOrderPayload,
  transaction: TransactionOrderPayload
): CheckoutOrderIntegrityResult {
  const transactionId = normalizeText(subscription.transactionId || subscription.transaction_id);
  if (!transactionId) return { ok: false, reason: 'missing_transaction_id' };

  const storedTransactionId = normalizeText(
    transaction.id || transaction.transactionId || transaction.transaction_id
  );
  if (storedTransactionId !== transactionId) {
    return { ok: false, reason: 'transaction_mismatch' };
  }
  if (normalizeText(transaction.status) !== 'completed') {
    return { ok: false, reason: 'transaction_not_completed' };
  }

  const subscriptionId = normalizeText(subscription.id);
  const transactionSubscriptionId = normalizeText(
    transaction.subscriptionId || transaction.subscription_id
  );
  if (!subscriptionId || transactionSubscriptionId !== subscriptionId) {
    return { ok: false, reason: 'subscription_mismatch' };
  }

  const customerId = normalizeText(subscription.customerId || subscription.customer_id);
  const transactionCustomerId = normalizeText(transaction.customerId || transaction.customer_id);
  if (
    !customerId ||
    !/^ctm_[a-z\d]{26}$/u.test(customerId) ||
    transactionCustomerId !== customerId
  ) {
    return { ok: false, reason: 'customer_mismatch' };
  }

  const currencyCode = normalizeCurrency(subscription.currencyCode || subscription.currency_code);
  const transactionCurrency = normalizeCurrency(
    transaction.currencyCode || transaction.currency_code
  );
  const totalsCurrency = normalizeCurrency(
    transaction.details?.totals?.currencyCode || transaction.details?.totals?.currency_code
  );
  if (!currencyCode || transactionCurrency !== currencyCode || totalsCurrency !== currencyCode) {
    return { ok: false, reason: 'currency_mismatch' };
  }

  const subscriptionItems = resolveOrderItems(subscription.items);
  const transactionLineItems = transaction.details?.lineItems || transaction.details?.line_items;
  const transactionItems = resolveOrderItems(transactionLineItems);
  if (
    !subscriptionItems ||
    !transactionItems ||
    subscriptionItems.length !== transactionItems.length ||
    subscriptionItems.some((item, index) => item !== transactionItems[index])
  ) {
    return { ok: false, reason: 'order_mismatch' };
  }

  const amount = normalizeMinorAmount(transaction.details?.totals?.total);
  if (!amount || lineItemTotal(transactionLineItems) !== amount) {
    return { ok: false, reason: 'amount_mismatch' };
  }

  return {
    ok: true,
    authority: { amount, currencyCode, customerId, transactionId },
  };
}
