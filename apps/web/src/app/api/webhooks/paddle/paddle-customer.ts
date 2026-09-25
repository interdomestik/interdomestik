import type { PaddleCustomerLookupResult } from '@interdomestik/domain-membership-billing/paddle-webhooks';
import { ApiError, type Paddle } from '@paddle/paddle-node-sdk';

const RETRYABLE_PADDLE_CUSTOMER_ERROR_CODES = new Set([
  'bad_gateway',
  'concurrent_modification',
  'internal_error',
  'service_unavailable',
  'temporarily_unavailable',
  'too_many_requests',
]);

function isRetryableLookupError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return RETRYABLE_PADDLE_CUSTOMER_ERROR_CODES.has(error.code);
}

export async function resolvePaddleCustomer(
  paddle: Paddle,
  customerId: string
): Promise<PaddleCustomerLookupResult> {
  try {
    const customer = await paddle.customers.get(customerId);
    return {
      kind: 'resolved',
      customer: {
        id: customer.id,
        email: customer.email,
        status: customer.status,
      },
    };
  } catch (error) {
    return { kind: 'failed', retryable: isRetryableLookupError(error) };
  }
}
