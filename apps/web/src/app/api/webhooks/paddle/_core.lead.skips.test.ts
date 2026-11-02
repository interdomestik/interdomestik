import { beforeEach, describe, expect, it, vi } from 'vitest';
import './_core.lead.test-support';
import {
  hoisted,
  callPaddleWebhookCore,
  receiptAdmission,
  subscriptionLookup,
  TEST_PADDLE_DELIVERY,
} from './_core.fixture';

describe('handlePaddleWebhookCore lead conversion', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.sha256Hex.mockReturnValue('payload_hash');
    hoisted.parsePaddleWebhookBody.mockReturnValue({
      parsedPayload: {
        event_type: 'transaction.completed',
        event_id: 'evt_payload',
        data: {
          id: 'txn_payload_1',
          subscriptionId: 'sub_provider_1',
          customData: { leadId: 'lead_payload_1' },
        },
      },
      eventTypeFromPayload: 'transaction.completed',
      eventIdFromPayload: 'evt_payload',
      eventTimestampFromPayload: null,
    });
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'transaction.completed',
        eventId: 'evt_verified',
        data: {
          id: 'txn_verified_1',
          subscriptionId: 'sub_provider_1',
          customData: { leadId: 'lead_1' },
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
        userId: 'user_1',
      })
    );
    hoisted.resolvePaddleUserOwner.mockResolvedValue(null);
    hoisted.insertWebhookEvent.mockResolvedValue(receiptAdmission());
    hoisted.persistInvoiceAndLedgerInvariants.mockResolvedValue(undefined);
    hoisted.hasTenantLeadForConversion.mockResolvedValue(true);
    hoisted.convertLeadToMember.mockResolvedValue({
      userId: 'member_user_1',
      createdSubscriptionId: 'membership_1',
    });
    hoisted.handlePaddleEvent.mockResolvedValue(undefined);
    hoisted.markWebhookProcessed.mockResolvedValue(undefined);
    hoisted.markWebhookFailed.mockResolvedValue(undefined);
  });

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

  it('marks the webhook failed for unexpected conversion errors', async () => {
    hoisted.convertLeadToMember.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(callPaddleWebhookCore()).rejects.toThrow('database unavailable');

    expect(hoisted.markWebhookFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptLease: receiptAdmission().receiptLease,
        eventType: 'transaction.completed',
        eventId: 'evt_verified',
        tenantId: 'tenant_1',
      }),
      expect.any(Object)
    );
    expect(hoisted.handlePaddleEvent).not.toHaveBeenCalled();
    expect(hoisted.markWebhookProcessed).not.toHaveBeenCalled();
  });
});
