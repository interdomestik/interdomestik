import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hoisted, callPaddleWebhookCore } from './_core.fixture';

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
    });
    hoisted.findSubscriptionByProviderReference.mockResolvedValue(null);
    hoisted.dbUserFindFirst.mockResolvedValue({ tenantId: 'tenant_from_user' });
    hoisted.insertWebhookEvent.mockResolvedValue({
      inserted: true,
      webhookEventRowId: 'webhook_event_1',
    });
    hoisted.persistInvoiceAndLedgerInvariants.mockResolvedValue(undefined);
    hoisted.handlePaddleEvent.mockResolvedValue(undefined);
    hoisted.markWebhookProcessed.mockResolvedValue(undefined);
  });

  it('prefers canonical subscription tenant over provider customData user fallback', async () => {
    hoisted.findSubscriptionByProviderReference.mockResolvedValue({
      id: 'sub_internal_1',
      tenantId: 'tenant_from_subscription',
      userId: 'canonical_user',
    });

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.findSubscriptionByProviderReference).toHaveBeenCalledWith('sub_provider_1');
    expect(hoisted.dbUserFindFirst).not.toHaveBeenCalled();
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
    expect(hoisted.findSubscriptionByProviderReference).toHaveBeenCalledWith('sub_provider_1');
    expect(hoisted.dbUserFindFirst).toHaveBeenCalledTimes(1);
    expect(hoisted.insertWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_from_user',
        processingScopeKey: 'tenant:tenant_from_user',
        dedupeKey: 'paddle:tenant:tenant_from_user:event:evt_verified',
      }),
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
    });

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.dbUserFindFirst).toHaveBeenCalledTimes(1);
    const query = hoisted.dbUserFindFirst.mock.calls[0]?.[0] as {
      where: (
        users: { id: string },
        ops: { eq: (left: string, right: string) => unknown }
      ) => unknown;
    };
    const eq = vi.fn();
    query.where({ id: 'users.id' }, { eq });
    expect(eq).toHaveBeenCalledWith('users.id', 'user_from_custom_data');
  });
});
