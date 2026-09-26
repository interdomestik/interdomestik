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
import { validateCheckoutOrderIntegrity } from './checkout-order-integrity';

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

  const authority = isEntityRoute
    ? await resolveEntityCheckoutTransactionAuthority(sub, processingScopeKey)
    : null;
  if (isEntityRoute && !authority) return null;
  const transactionData = authority
    ? authority.transactionData
    : await loadCheckoutTransactionData({
        transactionId,
        subscriptionId: sub.id,
        processingScopeKey,
        entityRoute: false,
      });
  if (!transactionData) return null;

  const customData =
    authority?.customData ??
    mergeCheckoutCustomData({
      subscriptionId: sub.id,
      transactionId,
      subscriptionCustomData,
      transactionCustomData: transactionData.customData || transactionData.custom_data,
    });
  if (!customData) return null;
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

export async function resolveEntityCheckoutTransactionAuthority(
  sub: SubscriptionPayloadLike,
  processingScopeKey: string
): Promise<{
  transactionData: Awaited<ReturnType<typeof loadCheckoutTransactionData>> & object;
  customData: CheckoutCustomData;
  amount: string;
  currencyCode: string;
  customerId: string;
  transactionId: string;
} | null> {
  const transactionId = normalizeCheckoutText(sub.transactionId || sub.transaction_id);
  if (!transactionId) {
    console.warn(
      `[Webhook] Cannot establish provider order authority for subscription ${sub.id}; missing transactionId`
    );
    return null;
  }

  const subscriptionCustomData = sub.customData || sub.custom_data;
  const subscriptionTenantId = normalizeCheckoutText(subscriptionCustomData?.tenantId);
  const billingEntity = resolveBillingEntityForTenantId(subscriptionTenantId);
  if (
    !processingScopeKey.startsWith('entity:') ||
    processingScopeKey !== (billingEntity ? `entity:${billingEntity}` : null)
  ) {
    console.warn(
      `[Webhook] Cannot establish provider order authority for subscription ${sub.id}; entity route and tenant context do not match`
    );
    return null;
  }

  const transactionData = await loadCheckoutTransactionData({
    transactionId,
    subscriptionId: sub.id,
    processingScopeKey,
    entityRoute: true,
  });
  if (!transactionData) return null;

  const integrity = validateCheckoutOrderIntegrity(sub, transactionData);
  if (!integrity.ok) {
    console.warn(
      `[Webhook] Cannot establish provider order authority for subscription ${sub.id}; ${integrity.reason}`
    );
    return null;
  }

  const customData = mergeCheckoutCustomData({
    subscriptionId: sub.id,
    transactionId,
    subscriptionCustomData,
    transactionCustomData: transactionData.customData || transactionData.custom_data,
  });
  if (!customData || !normalizeCheckoutText(customData.tenantId)) return null;

  return {
    transactionData,
    customData,
    ...integrity.authority,
  };
}

function mergeCheckoutCustomData(args: {
  subscriptionId: string;
  transactionId: string;
  subscriptionCustomData: CheckoutCustomData | undefined;
  transactionCustomData: CheckoutCustomData | undefined;
}): CheckoutCustomData | null {
  if (
    hasConflict('tenantId', args.subscriptionCustomData, args.transactionCustomData) ||
    hasConflict('userId', args.subscriptionCustomData, args.transactionCustomData)
  ) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${args.subscriptionId}; subscription customData conflicts with stored transaction ${args.transactionId}`
    );
    return null;
  }
  return { ...args.transactionCustomData, ...args.subscriptionCustomData };
}
