import {
  ApiError,
  type Paddle,
  type Subscription,
  type Transaction,
} from '@paddle/paddle-node-sdk';

import { getPaddle } from '../paddle-server';
import type { PaddleReadBack, PaddleTransaction } from '../sponsor-coverage/handover-evidence';

export type HandoverSubscription = PaddleReadBack & {
  nextBilledAt: string | null;
  scheduledChange: { action: string; effectiveAt?: string } | null;
};
export type CancelResponse =
  | { kind: 'ok'; subscription: PaddleReadBack }
  | { kind: 'definite_error'; code: string }
  | { kind: 'indeterminate' };
export type HandoverPaddleClient = {
  getSubscription(providerSubscriptionId: string): Promise<HandoverSubscription>;
  /** The only write: cancel at the next billing period. */
  cancelAtNextPeriod(providerSubscriptionId: string): Promise<CancelResponse>;
  /** Read every page and status for this subscription. */
  listTransactions(providerSubscriptionId: string): Promise<PaddleTransaction[]>;
};

export function toReadBack(entity: Subscription): HandoverSubscription {
  return {
    status: entity.status,
    scheduledChange: entity.scheduledChange
      ? {
          action: entity.scheduledChange.action,
          effectiveAt: entity.scheduledChange.effectiveAt,
        }
      : null,
    currentBillingPeriod: entity.currentBillingPeriod
      ? {
          startsAt: entity.currentBillingPeriod.startsAt,
          endsAt: entity.currentBillingPeriod.endsAt,
        }
      : null,
    nextBilledAt: entity.nextBilledAt,
  };
}

export function toTransaction(entity: Transaction): PaddleTransaction {
  return {
    id: entity.id,
    status: entity.status,
    billingPeriod: entity.billingPeriod ? { startsAt: entity.billingPeriod.startsAt } : null,
  };
}

export function classifyCancelFailure(error: unknown): CancelResponse {
  // Paddle's documented error types: `request_error` is a rejected request (4xx) that cannot
  // apply; `api_error` (5xx, and 429 rate limiting) may still apply. SDK 3.10.0 drops the HTTP
  // status, so the documented type is the signal. Transport failures, timeouts, aborts and any
  // other thrown value stay `indeterminate` (§3.7: only that request's own definite error refuses).
  if (error instanceof ApiError && error.type === 'request_error') {
    return { kind: 'definite_error', code: error.code || 'request_error' };
  }
  return { kind: 'indeterminate' };
}

export function createHandoverPaddleClient(
  tenantId: string,
  injected?: Paddle
): HandoverPaddleClient {
  // Resolved on first use, so a tenant with no due intent never needs a Paddle client.
  let resolved: Paddle | undefined = injected;
  const client = (): Paddle => {
    resolved ??= getPaddle({ tenantId });
    return resolved;
  };
  return {
    async getSubscription(providerSubscriptionId): Promise<HandoverSubscription> {
      return toReadBack(await client().subscriptions.get(providerSubscriptionId));
    },
    async cancelAtNextPeriod(providerSubscriptionId): Promise<CancelResponse> {
      try {
        const subscription = await client().subscriptions.cancel(providerSubscriptionId, {
          effectiveFrom: 'next_billing_period',
        });
        return { kind: 'ok', subscription: toReadBack(subscription) };
      } catch (error: unknown) {
        return classifyCancelFailure(error);
      }
    },
    async listTransactions(providerSubscriptionId): Promise<PaddleTransaction[]> {
      const collection = client().transactions.list({ subscriptionId: [providerSubscriptionId] });
      const transactions: PaddleTransaction[] = [];
      async function readNextPage(): Promise<PaddleTransaction[]> {
        if (!collection.hasMore) return transactions;
        const page = await collection.next();
        transactions.push(...page.map(toTransaction));
        return readNextPage();
      }
      return readNextPage();
    },
  };
}
