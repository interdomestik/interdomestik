import { installCoreHooks } from './_core.hooks.test-support';
import { hoisted, TEST_PADDLE_DELIVERY } from './_core.test-support';
import { describe, expect, it } from 'vitest';
import { handlePaddleWebhookEntityCore } from './_core';

describe('handlePaddleWebhookEntityCore', () => {
  installCoreHooks();

  it('delegates to shared core when resolved payload tenant matches expected entity', async () => {
    const result = await handlePaddleWebhookEntityCore({
      expectedEntity: 'ks',
      paddle: { mocked: true } as never,
      headers: new Headers({ 'paddle-signature': 'sig_ks' }),
      signature: 'sig_ks',
      secret: 'whsec_ks',
      bodyText: '{"event_type":"transaction.completed"}',
    });

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.verifyPaddleWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: 'whsec_ks',
        signature: 'sig_ks',
        // The preflight verification is bound to the entity route that received the delivery.
        billingEntity: 'ks',
      })
    );
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledTimes(1);
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledWith(
      expect.objectContaining({
        billingEntity: 'ks',
      })
    );
  });

  it('delegates to shared core when expected entity is mk and tenant resolves to tenant_mk', async () => {
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'transaction.completed',
        eventId: 'evt_mk',
        data: {
          customData: {
            userId: 'user_mk',
          },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
      delivery: TEST_PADDLE_DELIVERY,
    });
    hoisted.resolvePaddleUserOwner.mockResolvedValue({
      userId: 'user_owner',
      tenantId: 'tenant_mk',
    });

    const result = await handlePaddleWebhookEntityCore({
      expectedEntity: 'mk',
      paddle: { mocked: true } as never,
      headers: new Headers({ 'paddle-signature': 'sig_mk' }),
      signature: 'sig_mk',
      secret: 'whsec_mk',
      bodyText: '{"event_type":"transaction.completed"}',
    });

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledTimes(1);
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledWith(
      expect.objectContaining({
        billingEntity: 'mk',
      })
    );
  });

  it('delegates to shared core when expected entity is al and explicit tenant metadata is tenant_al', async () => {
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'transaction.completed',
        eventId: 'evt_al',
        data: {
          customData: {
            tenantId: 'tenant_al',
          },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
      delivery: TEST_PADDLE_DELIVERY,
    });

    const result = await handlePaddleWebhookEntityCore({
      expectedEntity: 'al',
      paddle: { mocked: true } as never,
      headers: new Headers({ 'paddle-signature': 'sig_al' }),
      signature: 'sig_al',
      secret: 'whsec_al',
      bodyText: '{"event_type":"transaction.completed"}',
    });

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledTimes(1);
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledWith(
      expect.objectContaining({
        billingEntity: 'al',
      })
    );
  });
});
