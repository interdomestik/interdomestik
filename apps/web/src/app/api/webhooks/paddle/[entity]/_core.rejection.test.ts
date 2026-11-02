import { installCoreHooks } from './_core.hooks.test-support';
import { hoisted, TEST_PADDLE_DELIVERY } from './_core.test-support';
import { describe, expect, it } from 'vitest';
import { handlePaddleWebhookEntityCore } from './_core';

describe('handlePaddleWebhookEntityCore', () => {
  installCoreHooks();

  it('rejects webhook when resolved tenant maps to a different entity', async () => {
    hoisted.resolvePaddleUserOwner.mockResolvedValue({
      userId: 'user_owner',
      tenantId: 'tenant_mk',
    });

    const result = await handlePaddleWebhookEntityCore({
      expectedEntity: 'ks',
      paddle: { mocked: true } as never,
      headers: new Headers({ 'paddle-signature': 'sig_mk' }),
      signature: 'sig_mk',
      secret: 'whsec_ks',
      bodyText: '{"event_type":"transaction.completed"}',
    });

    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: 'Webhook entity mismatch' });
    expect(hoisted.handlePaddleWebhookCore).not.toHaveBeenCalled();
  });

  it('rejects webhook when payload metadata tenant disagrees with expected entity', async () => {
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'transaction.completed',
        eventId: 'evt_mk',
        data: {
          customData: {
            tenantId: 'tenant_mk',
          },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
      delivery: TEST_PADDLE_DELIVERY,
    });
    hoisted.resolvePaddleUserOwner.mockResolvedValue(null);
    hoisted.dbSubscriptionFindFirst.mockResolvedValue(null);

    const result = await handlePaddleWebhookEntityCore({
      expectedEntity: 'ks',
      paddle: { mocked: true } as never,
      headers: new Headers({ 'paddle-signature': 'sig_mk' }),
      signature: 'sig_mk',
      secret: 'whsec_ks',
      bodyText: '{"event_type":"transaction.completed"}',
    });

    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: 'Webhook entity mismatch' });
    expect(hoisted.handlePaddleWebhookCore).not.toHaveBeenCalled();
  });

  it('rejects webhook when payload metadata entity disagrees with expected entity', async () => {
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'transaction.completed',
        eventId: 'evt_mk',
        data: {
          customData: {
            entity: 'mk',
          },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
      delivery: TEST_PADDLE_DELIVERY,
    });

    const result = await handlePaddleWebhookEntityCore({
      expectedEntity: 'ks',
      paddle: { mocked: true } as never,
      headers: new Headers({ 'paddle-signature': 'sig_mk' }),
      signature: 'sig_mk',
      secret: 'whsec_ks',
      bodyText: '{"event_type":"transaction.completed"}',
    });

    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: 'Webhook entity mismatch' });
    expect(hoisted.resolvePaddleUserOwner).not.toHaveBeenCalled();
    expect(hoisted.resolvePaddleSubscriptionOwner).not.toHaveBeenCalled();
    expect(hoisted.dbSubscriptionFindFirst).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleWebhookCore).not.toHaveBeenCalled();
  });

  it('delegates to shared core when tenant lookup throws during mismatch check', async () => {
    hoisted.resolvePaddleUserOwner.mockRejectedValue(new Error('db unavailable'));

    const result = await handlePaddleWebhookEntityCore({
      expectedEntity: 'ks',
      paddle: { mocked: true } as never,
      headers: new Headers({ 'paddle-signature': 'sig_ks' }),
      signature: 'sig_ks',
      secret: 'whsec_ks',
      bodyText: '{"event_type":"transaction.completed"}',
    });

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledTimes(1);
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledWith(
      expect.objectContaining({
        billingEntity: 'ks',
      })
    );
  });

  it('falls back to shared core handling when preflight signature verification fails', async () => {
    hoisted.verifyPaddleWebhook.mockRejectedValue(new Error('invalid signature'));
    hoisted.handlePaddleWebhookCore.mockResolvedValue({
      status: 401,
      body: { error: 'Invalid signature' },
    });

    const result = await handlePaddleWebhookEntityCore({
      expectedEntity: 'ks',
      paddle: { mocked: true } as never,
      headers: new Headers({ 'paddle-signature': 'sig_bad' }),
      signature: 'sig_bad',
      secret: 'whsec_ks',
      bodyText: '{"event_type":"transaction.completed"}',
    });

    expect(result).toEqual({ status: 401, body: { error: 'Invalid signature' } });
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledTimes(1);
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledWith(
      expect.objectContaining({
        billingEntity: 'ks',
      })
    );
  });
});
