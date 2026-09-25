import { resolveBillingEntityForTenantId } from '../../../paddle-server';
import type {
  CheckoutCustomData,
  ResolvePaddleCustomer,
  SubscriptionPayloadLike,
} from '../../types';
import {
  isPaddleCustomerId,
  loadCheckoutTransactionData,
  normalizeCheckoutText,
  resolveEntityCustomerEmail,
} from './checkout-transaction-authority';

function hasConflict(
  field: 'tenantId' | 'userId',
  current: CheckoutCustomData | undefined,
  stored: CheckoutCustomData | undefined
): boolean {
  const currentValue = normalizeCheckoutText(current?.[field]);
  const storedValue = normalizeCheckoutText(stored?.[field]);
  return Boolean(currentValue && storedValue && currentValue !== storedValue);
}

export async function resolveCheckoutTransactionEvidence(
  sub: SubscriptionPayloadLike,
  processingScopeKey: string,
  resolvePaddleCustomer?: ResolvePaddleCustomer
): Promise<{ customerEmail: string; customData: CheckoutCustomData } | null> {
  const transactionId = normalizeCheckoutText(sub.transactionId || sub.transaction_id);
  if (!transactionId) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; missing transactionId`
    );
    return null;
  }

  const subscriptionCustomData = sub.customData || sub.custom_data;
  const subscriptionTenantId = normalizeCheckoutText(subscriptionCustomData?.tenantId);
  const billingEntity = resolveBillingEntityForTenantId(subscriptionTenantId);
  const isEntityRoute = processingScopeKey.startsWith('entity:');
  if (isEntityRoute && processingScopeKey !== (billingEntity ? `entity:${billingEntity}` : null)) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; entity route and tenant context do not match`
    );
    return null;
  }

  const subscriptionCustomerId = normalizeCheckoutText(sub.customerId || sub.customer_id);
  if (isEntityRoute && (!subscriptionCustomerId || !isPaddleCustomerId(subscriptionCustomerId))) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; verified subscription customer identity is missing or invalid`
    );
    return null;
  }

  const transactionData = await loadCheckoutTransactionData({
    transactionId,
    subscriptionId: sub.id,
    processingScopeKey,
    entityRoute: isEntityRoute,
  });
  if (!transactionData) {
    return null;
  }

  const transactionCustomData = transactionData.customData || transactionData.custom_data;
  if (
    hasConflict('tenantId', subscriptionCustomData, transactionCustomData) ||
    hasConflict('userId', subscriptionCustomData, transactionCustomData)
  ) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; subscription customData conflicts with stored transaction ${transactionId}`
    );
    return null;
  }
  const customData = { ...transactionCustomData, ...subscriptionCustomData };
  const tenantId = normalizeCheckoutText(customData.tenantId);

  const customerEmail = isEntityRoute
    ? await resolveEntityCustomerEmail({
        transactionData,
        subscriptionCustomerId,
        subscriptionId: sub.id,
        resolvePaddleCustomer,
      })
    : (normalizeCheckoutText(
        transactionData.customerEmail || transactionData.customer_email
      )?.toLowerCase() ?? null);

  if (!tenantId || !customerEmail) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; missing tenant/email in stored transaction ${transactionId}`
    );
    return null;
  }

  return { customerEmail, customData };
}
