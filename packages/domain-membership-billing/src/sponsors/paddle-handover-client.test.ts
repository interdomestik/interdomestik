import { ApiError, Paddle, type Subscription, type Transaction } from '@paddle/paddle-node-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPaddle } from '../paddle-server';
import {
  classifyCancelFailure,
  createHandoverPaddleClient,
  toReadBack,
  toTransaction,
} from './paddle-handover-client';

vi.mock('../paddle-server', () => ({ getPaddle: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

const startsAt = '2026-11-01T00:00:00.123Z';
const endsAt = '2027-11-01T00:00:00.123Z';
const subscription: Subscription = {
  id: 'sub_1',
  status: 'active',
  customerId: 'ctm_1',
  addressId: 'add_1',
  businessId: null,
  currencyCode: 'EUR',
  createdAt: startsAt,
  updatedAt: startsAt,
  startedAt: startsAt,
  firstBilledAt: startsAt,
  nextBilledAt: endsAt,
  pausedAt: null,
  canceledAt: null,
  discount: null,
  collectionMode: 'automatic',
  billingDetails: null,
  currentBillingPeriod: { startsAt, endsAt },
  billingCycle: { interval: 'year', frequency: 1 },
  scheduledChange: { action: 'cancel', effectiveAt: endsAt, resumeAt: null },
  managementUrls: null,
  items: [],
  customData: null,
  importMeta: null,
  nextTransaction: null,
  recurringTransactionDetails: null,
};
const transaction: Transaction = {
  id: 'txn_1',
  status: 'paid',
  customerId: 'ctm_1',
  addressId: 'add_1',
  businessId: null,
  customData: null,
  currencyCode: 'EUR',
  origin: 'subscription_recurring',
  subscriptionId: 'sub_1',
  invoiceId: null,
  invoiceNumber: null,
  collectionMode: 'automatic',
  discountId: null,
  billingDetails: null,
  billingPeriod: { startsAt, endsAt },
  items: [],
  details: null,
  payments: [],
  checkout: null,
  createdAt: startsAt,
  updatedAt: startsAt,
  billedAt: startsAt,
  revisedAt: null,
  address: null,
  adjustments: null,
  adjustmentsTotals: null,
  business: null,
  customer: null,
  discount: null,
  availablePaymentMethods: null,
};

function apiError(code: string, type = 'request_error'): ApiError {
  return new ApiError({ type, code, detail: 'Request failed', documentation_url: '' }, null);
}

// Paddle documents `request_error` for rejected (4xx) requests and `api_error` for 5xx and 429.
const failures = [
  { error: apiError('bad_request'), code: 'bad_request' },
  {
    error: apiError('subscription_locked_pending_changes'),
    code: 'subscription_locked_pending_changes',
  },
  { error: apiError(''), code: 'request_error' },
  { error: apiError('internal_error', 'api_error') },
  { error: apiError('too_many_requests', 'api_error') },
  { error: new TypeError('fetch failed') },
  { error: new DOMException('Aborted', 'AbortError') },
  { error: 'request failed' },
  { error: { type: 'request_error', code: 'bad_request' } },
];

describe('handover Paddle client', () => {
  it('maps subscription evidence and preserves exact timestamps', () => {
    expect(toReadBack(subscription)).toEqual({
      status: 'active',
      scheduledChange: { action: 'cancel' },
      currentBillingPeriod: { startsAt, endsAt },
      nextBilledAt: endsAt,
    });
    expect(
      toReadBack({
        ...subscription,
        scheduledChange: null,
        currentBillingPeriod: null,
        nextBilledAt: null,
      })
    ).toEqual({
      status: 'active',
      scheduledChange: null,
      currentBillingPeriod: null,
      nextBilledAt: null,
    });
  });

  it('maps transactions with and without billing periods', () => {
    expect(toTransaction(transaction)).toEqual({
      id: 'txn_1',
      status: 'paid',
      billingPeriod: { startsAt },
    });
    expect(toTransaction({ ...transaction, billingPeriod: null })).toEqual({
      id: 'txn_1',
      status: 'paid',
      billingPeriod: null,
    });
  });

  it('gets a mapped subscription using the tenant-bound default client', async () => {
    const paddle = new Paddle('test_key');
    const get = vi.spyOn(paddle.subscriptions, 'get').mockResolvedValue(subscription);
    vi.mocked(getPaddle).mockReturnValue(paddle);
    const client = createHandoverPaddleClient('tenant_mk');
    expect(getPaddle).toHaveBeenCalledWith({ tenantId: 'tenant_mk' });
    expect(await client.getSubscription('sub_1')).toEqual(toReadBack(subscription));
    expect(get).toHaveBeenCalledWith('sub_1');
  });

  it('concatenates every page in order without filtering transaction statuses', async () => {
    const paddle = new Paddle('test_key');
    const collection = paddle.transactions.list({ subscriptionId: ['sub_1'] });
    const second: Transaction = { ...transaction, id: 'txn_2', status: 'past_due' };
    const next = vi
      .spyOn(collection, 'next')
      .mockResolvedValueOnce([transaction])
      .mockImplementationOnce(async () => {
        collection.hasMore = false;
        return [second];
      });
    const list = vi.spyOn(paddle.transactions, 'list').mockReturnValue(collection);
    expect(await createHandoverPaddleClient('tenant_ks', paddle).listTransactions('sub_1')).toEqual(
      [toTransaction(transaction), toTransaction(second)]
    );
    expect(list).toHaveBeenCalledExactlyOnceWith({ subscriptionId: ['sub_1'] });
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('returns an empty transaction list when the final page is empty', async () => {
    const paddle = new Paddle('test_key');
    const collection = paddle.transactions.list();
    vi.spyOn(collection, 'next').mockImplementationOnce(async () => {
      collection.hasMore = false;
      return [];
    });
    vi.spyOn(paddle.transactions, 'list').mockReturnValue(collection);
    expect(await createHandoverPaddleClient('tenant_ks', paddle).listTransactions('sub_1')).toEqual(
      []
    );
  });

  it('returns the cancel response evidence and schedules only next-period cancellation', async () => {
    const paddle = new Paddle('test_key');
    const cancel = vi.spyOn(paddle.subscriptions, 'cancel').mockResolvedValue(subscription);
    const get = vi.spyOn(paddle.subscriptions, 'get');
    expect(
      await createHandoverPaddleClient('tenant_ks', paddle).cancelAtNextPeriod('sub_1')
    ).toEqual({
      kind: 'ok',
      subscription: toReadBack(subscription),
    });
    expect(cancel).toHaveBeenCalledExactlyOnceWith('sub_1', {
      effectiveFrom: 'next_billing_period',
    });
    expect(get).not.toHaveBeenCalled();
  });

  it.each(failures)(
    'classifies cancellation failure %# conservatively',
    async ({ error, code }) => {
      const expected = code ? { kind: 'definite_error', code } : { kind: 'indeterminate' };
      expect(classifyCancelFailure(error)).toEqual(expected);
      const paddle = new Paddle('test_key');
      vi.spyOn(paddle.subscriptions, 'cancel').mockRejectedValue(error);
      expect(
        await createHandoverPaddleClient('tenant_ks', paddle).cancelAtNextPeriod('sub_1')
      ).toEqual(expected);
    }
  );

  it('propagates subscription and later-page read failures for caller retry', async () => {
    const paddle = new Paddle('test_key');
    const error = new TypeError('fetch failed');
    vi.spyOn(paddle.subscriptions, 'get').mockRejectedValue(error);
    const collection = paddle.transactions.list();
    vi.spyOn(collection, 'next').mockResolvedValueOnce([transaction]).mockRejectedValueOnce(error);
    vi.spyOn(paddle.transactions, 'list').mockReturnValue(collection);
    const client = createHandoverPaddleClient('tenant_ks', paddle);
    await expect(client.getSubscription('sub_1')).rejects.toBe(error);
    await expect(client.listTransactions('sub_1')).rejects.toBe(error);
  });
});
