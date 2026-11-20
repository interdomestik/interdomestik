import { describe, expect, it } from 'vitest';

import { PaddleWebhookPayloadSchemaError, isRetryablePaddleWebhookError } from './errors';
import { buildRawTrialingSubscriptionCreatedData } from './paddle-null-fields.fixture';
import { subscriptionEventDataSchema, transactionEventDataSchema } from './schemas';

describe('Paddle event schemas accept provider nulls', () => {
  it('parses the raw trialing subscription.created payload with its null fields', () => {
    const result = subscriptionEventDataSchema.safeParse(buildRawTrialingSubscriptionCreatedData());

    expect(result.success).toBe(true);
    expect(result.data?.scheduled_change).toBeNull();
    expect(result.data?.custom_data?.userId).toBe('user_123');
  });

  it.each(['scheduled_change', 'scheduledChange', 'custom_data', 'customData'])(
    'accepts a null subscription %s',
    field => {
      const data = { ...buildRawTrialingSubscriptionCreatedData(), [field]: null };

      expect(subscriptionEventDataSchema.safeParse(data).success).toBe(true);
    }
  );

  it.each(['current_billing_period', 'currentBillingPeriod'])(
    'accepts a null subscription %s (paused or canceled subscriptions)',
    field => {
      const data = { ...buildRawTrialingSubscriptionCreatedData(), [field]: null };

      expect(subscriptionEventDataSchema.safeParse(data).success).toBe(true);
    }
  );

  it('accepts a null price billing cycle (one-time prices)', () => {
    const data = {
      id: 'sub_123',
      status: 'active',
      items: [{ price: { id: 'pri_once', billing_cycle: null, billingCycle: null } }],
    };

    expect(subscriptionEventDataSchema.safeParse(data).success).toBe(true);
  });

  it('accepts null transaction custom data', () => {
    const data = { id: 'txn_123', status: 'completed', custom_data: null, customData: null };

    expect(transactionEventDataSchema.safeParse(data).success).toBe(true);
  });

  it('still rejects a wrongly typed scheduled change', () => {
    const data = { ...buildRawTrialingSubscriptionCreatedData(), scheduled_change: 'cancel' };

    expect(subscriptionEventDataSchema.safeParse(data).success).toBe(false);
  });
});

describe('PaddleWebhookPayloadSchemaError', () => {
  it('is retryable and names only field paths and issue codes, never values', () => {
    const parsed = subscriptionEventDataSchema.safeParse({
      id: 'sub_123',
      status: 'active',
      scheduled_change: 'secret-value',
    });
    expect(parsed.success).toBe(false);

    const error = new PaddleWebhookPayloadSchemaError('subscription', parsed.error!.issues);

    expect(isRetryablePaddleWebhookError(error)).toBe(true);
    expect(error.name).toBe('PaddleWebhookPayloadSchemaError');
    expect(error.message).toBe('Invalid Paddle subscription data: scheduled_change (invalid_type)');
    expect(error.message).not.toContain('secret-value');
  });

  it('bounds the reported issues and labels root issues', () => {
    const issues = Array.from({ length: 12 }, (_, index) => ({
      path: index === 0 ? [] : ['items', index, 'price'],
      code: 'invalid_type',
    }));

    const error = new PaddleWebhookPayloadSchemaError('transaction', issues);

    expect(error.message).toMatch(/^Invalid Paddle transaction data: \(root\) \(invalid_type\); /);
    expect(error.message).toContain('items.9.price (invalid_type)');
    expect(error.message).not.toContain('items.10.price');
    expect(error.message).toMatch(/; \+2 more$/);
  });
});
