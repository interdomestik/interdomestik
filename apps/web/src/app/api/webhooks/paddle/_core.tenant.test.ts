import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaddleSubscriptionReferenceAmbiguousError } from '@interdomestik/domain-membership-billing/paddle-webhooks/persist';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import {
  hoisted,
  callPaddleWebhookCore,
  receiptAdmission,
  subscriptionLookup,
  TEST_PADDLE_DELIVERY,
} from './_core.fixture';

describe('handlePaddleWebhookCore tenant resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.sha256Hex.mockReturnValue('payload_hash');
    hoisted.parsePaddleWebhookBody.mockReturnValue({
      parsedPayload: { data: {} },
      eventTypeFromPayload: 'subscription.updated',
      eventIdFromPayload: 'evt_payload',
      eventTimestampFromPayload: null,
    });
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'subscription.updated',
        eventId: 'evt_verified',
        data: {
          id: 'sub_provider_1',
          customData: {
            userId: 'user_from_custom_data',
          },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
      delivery: TEST_PADDLE_DELIVERY,
    });
    hoisted.findPaddleSubscriptionByReference.mockResolvedValue(null);
    hoisted.resolvePaddleUserOwner.mockResolvedValue({
      userId: 'user_from_custom_data',
      tenantId: 'tenant_from_user',
    });
    hoisted.insertWebhookEvent.mockResolvedValue(receiptAdmission());
    hoisted.persistInvoiceAndLedgerInvariants.mockResolvedValue(undefined);
    hoisted.handlePaddleEvent.mockResolvedValue(undefined);
    hoisted.markWebhookProcessed.mockResolvedValue(undefined);
  });

  it('prefers canonical subscription tenant over provider customData user fallback', async () => {
    const lookup = subscriptionLookup({
      id: 'sub_internal_1',
      tenantId: 'tenant_from_subscription',
      userId: 'canonical_user',
    });
    hoisted.findPaddleSubscriptionByReference.mockResolvedValue(lookup);

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.findPaddleSubscriptionByReference).toHaveBeenCalledWith(
      'sub_provider_1',
      TEST_PADDLE_DELIVERY
    );
    expect(hoisted.resolvePaddleUserOwner).not.toHaveBeenCalled();
    // The authority the subscription was read under is the one handlers receive; the user fallback
    // never mints a second one.
    expect(hoisted.authorizePaddleTenant).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ delivery: TEST_PADDLE_DELIVERY, authority: lookup.authority }),
      expect.any(Object)
    );
    // Invoice/ledger persistence derives its billing authority from the same verified delivery.
    expect(hoisted.persistInvoiceAndLedgerInvariants).toHaveBeenCalledWith(
      expect.objectContaining({ delivery: TEST_PADDLE_DELIVERY }),
      expect.any(Object)
    );
    expect(hoisted.insertWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_from_subscription',
        processingScopeKey: 'tenant:tenant_from_subscription',
        dedupeKey: 'paddle:tenant:tenant_from_subscription:event:evt_verified',
      }),
      expect.any(Object)
    );
  });

  it('falls back to customData user tenant only when subscription lookup cannot resolve tenant', async () => {
    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.findPaddleSubscriptionByReference).toHaveBeenCalledWith(
      'sub_provider_1',
      TEST_PADDLE_DELIVERY
    );
    expect(hoisted.resolvePaddleUserOwner).toHaveBeenCalledTimes(1);
    expect(hoisted.resolvePaddleUserOwner).toHaveBeenCalledWith('user_from_custom_data');
    // The authority is minted from the delivery and the exact owner object the resolver returned.
    const owner = await hoisted.resolvePaddleUserOwner.mock.results[0]!.value;
    expect(hoisted.authorizePaddleTenant).toHaveBeenCalledTimes(1);
    expect(hoisted.authorizePaddleTenant).toHaveBeenCalledWith(TEST_PADDLE_DELIVERY, owner);
    expect(hoisted.authorizePaddleTenant.mock.calls[0]![1]).toBe(owner);
    const authority = hoisted.authorizePaddleTenant.mock.results[0]!.value;
    expect(readTenantAuthority(authority).tenantId).toBe('tenant_from_user');
    expect(hoisted.handlePaddleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ delivery: TEST_PADDLE_DELIVERY, authority }),
      expect.any(Object)
    );
    expect(hoisted.insertWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_from_user',
        processingScopeKey: 'tenant:tenant_from_user',
        dedupeKey: 'paddle:tenant:tenant_from_user:event:evt_verified',
      }),
      expect.any(Object)
    );
  });

  it('fails closed before admitting a receipt when the subscription row names another tenant than its authority', async () => {
    hoisted.findPaddleSubscriptionByReference.mockResolvedValue({
      subscription: { id: 'sub_internal_1', tenantId: 'tenant_a', userId: 'canonical_user' },
      authority: subscriptionLookup({ tenantId: 'tenant_b' }).authority,
    });

    await expect(callPaddleWebhookCore()).rejects.toThrow(
      'subscription tenant conflict: record=tenant_a authority=tenant_b'
    );

    expect(hoisted.insertWebhookEvent).not.toHaveBeenCalled();
    expect(hoisted.persistInvoiceAndLedgerInvariants).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleEvent).not.toHaveBeenCalled();
  });

  it('never mints an authority from provider customData tenant', async () => {
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'subscription.updated',
        eventId: 'evt_verified',
        data: { id: 'sub_provider_1', customData: { tenantId: 'tenant_from_custom_data' } },
      },
      signatureValid: true,
      signatureBypassed: false,
      delivery: TEST_PADDLE_DELIVERY,
    });
    hoisted.findPaddleSubscriptionByReference.mockResolvedValue(null);

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.authorizePaddleTenant).not.toHaveBeenCalled();
    expect(hoisted.insertWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: null }),
      expect.any(Object)
    );
    expect(hoisted.handlePaddleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ delivery: TEST_PADDLE_DELIVERY, authority: null }),
      expect.any(Object)
    );
  });

  it('normalizes customData user fallback before resolving tenant', async () => {
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'subscription.updated',
        eventId: 'evt_verified',
        data: {
          id: 'sub_provider_1',
          customData: {
            userId: '  user_from_custom_data  ',
          },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
      delivery: TEST_PADDLE_DELIVERY,
    });

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    // The fallback resolves by the trimmed id only; the privileged lookup names the tenant.
    expect(hoisted.resolvePaddleUserOwner).toHaveBeenCalledTimes(1);
    expect(hoisted.resolvePaddleUserOwner).toHaveBeenCalledWith('user_from_custom_data');
  });
});

describe('handlePaddleWebhookCore ambiguous subscription reference', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.sha256Hex.mockReturnValue('payload_hash');
    hoisted.parsePaddleWebhookBody.mockReturnValue({
      parsedPayload: { data: {} },
      eventTypeFromPayload: 'subscription.updated',
      eventIdFromPayload: 'evt_payload',
      eventTimestampFromPayload: null,
    });
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'subscription.updated',
        eventId: 'evt_verified',
        data: {
          id: 'sub_provider_1',
          customData: { userId: 'user_from_custom_data' },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
      delivery: TEST_PADDLE_DELIVERY,
    });
    hoisted.findPaddleSubscriptionByReference.mockRejectedValue(
      new PaddleSubscriptionReferenceAmbiguousError('sub_provider_1')
    );
    hoisted.resolvePaddleUserOwner.mockResolvedValue({
      userId: 'user_from_custom_data',
      tenantId: 'tenant_from_user',
    });
    hoisted.insertWebhookEvent.mockResolvedValue(receiptAdmission());
    hoisted.persistInvoiceAndLedgerInvariants.mockResolvedValue(undefined);
    hoisted.handlePaddleEvent.mockResolvedValue(undefined);
    hoisted.markWebhookProcessed.mockResolvedValue(undefined);
    hoisted.markWebhookFailed.mockResolvedValue(undefined);
  });

  it('admits the receipt without a tenant, records a non-retryable failure and runs nothing else', async () => {
    await expect(callPaddleWebhookCore()).rejects.toBeInstanceOf(
      PaddleSubscriptionReferenceAmbiguousError
    );

    // customData must not stand in for an ambiguous subscription reference.
    expect(hoisted.resolvePaddleUserOwner).not.toHaveBeenCalled();
    expect(hoisted.insertWebhookEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.insertWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: null }),
      expect.any(Object)
    );
    expect(hoisted.persistInvoiceAndLedgerInvariants).not.toHaveBeenCalled();
    expect(hoisted.hasTenantLeadForConversion).not.toHaveBeenCalled();
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleEvent).not.toHaveBeenCalled();
    expect(hoisted.markWebhookProcessed).not.toHaveBeenCalled();
    expect(hoisted.markWebhookFailed).toHaveBeenCalledTimes(1);
    expect(hoisted.markWebhookFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        retryable: false,
        tenantId: null,
        receiptLease: receiptAdmission().receiptLease,
        error: expect.any(PaddleSubscriptionReferenceAmbiguousError),
      }),
      expect.any(Object)
    );
  });

  it('propagates other subscription lookup failures without admitting a receipt', async () => {
    hoisted.findPaddleSubscriptionByReference.mockRejectedValue(new Error('db down'));

    await expect(callPaddleWebhookCore()).rejects.toThrow('db down');

    expect(hoisted.insertWebhookEvent).not.toHaveBeenCalled();
    expect(hoisted.resolvePaddleUserOwner).not.toHaveBeenCalled();
  });
});
