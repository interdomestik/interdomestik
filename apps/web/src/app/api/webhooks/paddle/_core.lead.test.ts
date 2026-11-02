import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import {
  hoisted,
  callPaddleWebhookCore,
  receiptAdmission,
  subscriptionLookup,
  TEST_PADDLE_DELIVERY,
} from './_core.fixture';

// The lead lookup and conversion run under the webhook's tenant authority, the very token the
// event handlers receive, never a caller-built tenant literal.
function expectLeadCall(
  mock: { mock: { calls: unknown[][] } },
  tenantId: string,
  args: Record<string, unknown>
) {
  const [authority, callArgs] = mock.mock.calls[0] as [
    Parameters<typeof readTenantAuthority>[0],
    unknown,
  ];
  expect(readTenantAuthority(authority).tenantId).toBe(tenantId);
  expect(callArgs).toEqual(args);
  const handlerParams = hoisted.handlePaddleEvent.mock.calls[0]![0] as { authority: unknown };
  expect(authority).toBe(handlerParams.authority);
}

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

  it('converts a canonical tenant-scoped lead for transaction.completed', async () => {
    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    expectLeadCall(hoisted.hasTenantLeadForConversion, 'tenant_1', { leadId: 'lead_1' });
    expectLeadCall(hoisted.convertLeadToMember, 'tenant_1', { leadId: 'lead_1' });
    expect(hoisted.handlePaddleEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.markWebhookProcessed).toHaveBeenCalledTimes(1);
    expect(hoisted.markWebhookFailed).not.toHaveBeenCalled();
  });

  it('skips lead conversion when the webhook cannot resolve a canonical tenant', async () => {
    hoisted.findPaddleSubscriptionByReference.mockResolvedValue(null);
    hoisted.resolvePaddleUserOwner.mockResolvedValue(null);

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.insertWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: null,
        processingScopeKey: 'global',
      }),
      expect.any(Object)
    );
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.markWebhookProcessed).toHaveBeenCalledTimes(1);
  });

  it('skips lead conversion for missing, empty, or malformed provider lead IDs', async () => {
    for (const leadId of [undefined, '', '   ', '../lead_1', 'lead 1']) {
      vi.clearAllMocks();
      hoisted.sha256Hex.mockReturnValue('payload_hash');
      hoisted.parsePaddleWebhookBody.mockReturnValue({
        parsedPayload: { data: {} },
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
            customData: { leadId },
          },
        },
        signatureValid: true,
        signatureBypassed: false,
        delivery: TEST_PADDLE_DELIVERY,
      });
      hoisted.findPaddleSubscriptionByReference.mockResolvedValue(
        subscriptionLookup({ tenantId: 'tenant_1' })
      );
      hoisted.insertWebhookEvent.mockResolvedValue(receiptAdmission());
      hoisted.persistInvoiceAndLedgerInvariants.mockResolvedValue(undefined);
      hoisted.hasTenantLeadForConversion.mockResolvedValue(true);
      hoisted.handlePaddleEvent.mockResolvedValue(undefined);
      hoisted.markWebhookProcessed.mockResolvedValue(undefined);

      const result = await callPaddleWebhookCore();

      expect(result).toEqual({ status: 200, body: { success: true } });
      expect(hoisted.hasTenantLeadForConversion).not.toHaveBeenCalled();
      expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
      expect(hoisted.handlePaddleEvent).toHaveBeenCalledTimes(1);
      expect(hoisted.markWebhookProcessed).toHaveBeenCalledTimes(1);
    }
  });

  it('skips conversion when canonical lead ownership does not match the resolved tenant', async () => {
    hoisted.hasTenantLeadForConversion.mockResolvedValueOnce(false);

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    expectLeadCall(hoisted.hasTenantLeadForConversion, 'tenant_1', { leadId: 'lead_1' });
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.markWebhookProcessed).toHaveBeenCalledTimes(1);
    expect(hoisted.markWebhookFailed).not.toHaveBeenCalled();
  });

  it('uses subscriptionId before transaction id for canonical tenant resolution', async () => {
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'transaction.completed',
        eventId: 'evt_verified',
        data: {
          id: 'txn_verified_1',
          subscriptionId: 'sub_provider_1',
          customData: { userId: 'canonical_user', leadId: 'lead_1' },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
      delivery: TEST_PADDLE_DELIVERY,
    });
    hoisted.findPaddleSubscriptionByReference.mockImplementation(async reference =>
      reference === 'sub_provider_1'
        ? subscriptionLookup({
            id: 'sub_internal_1',
            tenantId: 'tenant_from_subscription',
            userId: 'canonical_user',
          })
        : null
    );
    hoisted.hasTenantLeadForConversion.mockResolvedValueOnce(true);

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.findPaddleSubscriptionByReference).toHaveBeenCalledWith(
      'sub_provider_1',
      TEST_PADDLE_DELIVERY
    );
    expect(hoisted.findPaddleSubscriptionByReference).not.toHaveBeenCalledWith(
      'txn_verified_1',
      TEST_PADDLE_DELIVERY
    );
    expect(hoisted.resolvePaddleUserOwner).not.toHaveBeenCalled();
    expectLeadCall(hoisted.convertLeadToMember, 'tenant_from_subscription', { leadId: 'lead_1' });
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
