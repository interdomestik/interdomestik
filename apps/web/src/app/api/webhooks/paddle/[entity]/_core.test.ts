import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  handlePaddleWebhookCore: vi.fn(),
  parsePaddleWebhookBody: vi.fn(),
  verifyPaddleWebhook: vi.fn(),
  dbUserFindFirst: vi.fn(),
  dbSubscriptionFindFirst: vi.fn(),
}));

vi.mock('../_core', () => ({
  handlePaddleWebhookCore: hoisted.handlePaddleWebhookCore,
}));

vi.mock('@interdomestik/domain-membership-billing/paddle-webhooks', async () => {
  const actual = await vi.importActual<
    typeof import('@interdomestik/domain-membership-billing/paddle-webhooks')
  >('@interdomestik/domain-membership-billing/paddle-webhooks');
  return {
    ...actual,
    parsePaddleWebhookBody: hoisted.parsePaddleWebhookBody,
    verifyPaddleWebhook: hoisted.verifyPaddleWebhook,
  };
});

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      user: {
        findFirst: hoisted.dbUserFindFirst,
      },
      subscriptions: {
        findFirst: hoisted.dbSubscriptionFindFirst,
      },
    },
  },
}));

import { handlePaddleWebhookEntityCore } from './_core';

describe('handlePaddleWebhookEntityCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.handlePaddleWebhookCore.mockResolvedValue({ status: 200, body: { success: true } });
    hoisted.parsePaddleWebhookBody.mockReturnValue({
      parsedPayload: {
        event_type: 'transaction.completed',
        data: {
          customData: {
            userId: 'user_ks',
          },
        },
      },
      eventTypeFromPayload: 'transaction.completed',
      eventIdFromPayload: 'evt_ks',
      eventTimestampFromPayload: new Date('2026-02-23T00:00:00.000Z'),
    });
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'transaction.completed',
        eventId: 'evt_ks',
        data: {
          customData: {
            userId: 'user_ks',
          },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
    });
    hoisted.dbUserFindFirst.mockResolvedValue({ tenantId: 'tenant_ks' });
    hoisted.dbSubscriptionFindFirst.mockResolvedValue(null);
  });

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
      })
    );
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledTimes(1);
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledWith(
      expect.objectContaining({
        billingEntity: 'ks',
      })
    );
  });

  it('rejects webhook when resolved tenant maps to a different entity', async () => {
    hoisted.dbUserFindFirst.mockResolvedValue({ tenantId: 'tenant_mk' });

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
    });
    hoisted.dbUserFindFirst.mockResolvedValue(null);
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
    expect(hoisted.dbUserFindFirst).not.toHaveBeenCalled();
    expect(hoisted.dbSubscriptionFindFirst).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleWebhookCore).not.toHaveBeenCalled();
  });

  it('delegates to shared core when tenant lookup throws during mismatch check', async () => {
    hoisted.dbUserFindFirst.mockRejectedValue(new Error('db unavailable'));

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
