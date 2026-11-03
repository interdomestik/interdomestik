import { installCoreHooks } from './_core.lead.hooks.test-support';
import { describe, expect, it, vi } from 'vitest';
import { expectLeadCall } from './_core.lead.test-support';
import {
  hoisted,
  callPaddleWebhookCore,
  receiptAdmission,
  subscriptionLookup,
  TEST_PADDLE_DELIVERY,
} from './_core.fixture';

describe('handlePaddleWebhookCore lead conversion', () => {
  installCoreHooks();

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
});
