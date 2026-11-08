import { isRetryablePaddleWebhookError } from '@interdomestik/domain-membership-billing/paddle-webhooks/persist';
import { installCoreHooks } from './_core.lead.hooks.test-support';
import { describe, expect, it } from 'vitest';

import {
  hoisted,
  callPaddleWebhookCore,
  receiptAdmission,
  subscriptionLookup,
  TEST_PADDLE_DELIVERY,
} from './_core.fixture';

describe('handlePaddleWebhookCore lead conversion', () => {
  installCoreHooks();

  it('skips lead conversion when provider user metadata conflicts with canonical subscription', async () => {
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'transaction.completed',
        eventId: 'evt_verified',
        data: {
          id: 'txn_verified_1',
          subscriptionId: 'sub_provider_1',
          customData: { userId: 'user_bad', leadId: 'lead_1' },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
      delivery: TEST_PADDLE_DELIVERY,
    });
    hoisted.findPaddleSubscriptionByReference.mockResolvedValue(
      subscriptionLookup({
        id: 'sub_internal_1',
        tenantId: 'tenant_1',
        userId: 'user_real',
      })
    );

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.hasTenantLeadForConversion).not.toHaveBeenCalled();
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.markWebhookProcessed).toHaveBeenCalledTimes(1);
    expect(hoisted.markWebhookFailed).not.toHaveBeenCalled();
  });

  it('skips lead conversion when provider user metadata cannot be reconciled to subscription user', async () => {
    hoisted.findPaddleSubscriptionByReference.mockResolvedValue(
      subscriptionLookup({
        id: 'sub_internal_1',
        tenantId: 'tenant_1',
        userId: null,
      })
    );
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'transaction.completed',
        eventId: 'evt_verified',
        data: {
          id: 'txn_verified_1',
          subscriptionId: 'sub_provider_1',
          customData: { userId: 'user_unproven', leadId: 'lead_1' },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
      delivery: TEST_PADDLE_DELIVERY,
    });

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.hasTenantLeadForConversion).not.toHaveBeenCalled();
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.markWebhookProcessed).toHaveBeenCalledTimes(1);
  });

  it('does not run lead conversion for duplicate webhook receipts', async () => {
    hoisted.insertWebhookEvent.mockResolvedValue({
      inserted: false,
      webhookEventRowId: null,
    });

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true, duplicate: true } });
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleEvent).not.toHaveBeenCalled();
    expect(hoisted.markWebhookProcessed).not.toHaveBeenCalled();
  });

  it('preserves invalid-signature persistence without lead conversion', async () => {
    hoisted.verifyPaddleWebhook.mockRejectedValueOnce(new Error('Invalid signature'));
    hoisted.persistInvalidSignatureAttempt.mockResolvedValueOnce({
      inserted: true,
      webhookEventRowId: 'webhook_event_invalid_1',
    });

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 401, body: { error: 'Invalid signature' } });
    expect(hoisted.persistInvalidSignatureAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'transaction.completed',
        eventId: 'evt_payload',
        processingScopeKey: 'global',
      }),
      expect.any(Object)
    );
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
    expect(hoisted.insertWebhookEvent).not.toHaveBeenCalled();
  });

  it('marks the webhook retryable for unexpected conversion errors', async () => {
    const cause = new Error('database unavailable');
    hoisted.convertLeadToMember.mockRejectedValueOnce(cause);

    const failure = await callPaddleWebhookCore().catch((error: unknown) => error);
    expect(isRetryablePaddleWebhookError(failure)).toBe(true);
    expect((failure as Error).cause).toBe(cause);

    expect(hoisted.markWebhookFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptLease: receiptAdmission().receiptLease,
        eventType: 'transaction.completed',
        eventId: 'evt_verified',
        retryable: true,
        tenantId: 'tenant_1',
      }),
      expect.any(Object)
    );
    expect(hoisted.handlePaddleEvent).not.toHaveBeenCalled();
    expect(hoisted.markWebhookProcessed).not.toHaveBeenCalled();
  });
});
