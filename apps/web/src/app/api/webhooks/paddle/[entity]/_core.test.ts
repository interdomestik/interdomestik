import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  handlePaddleWebhookCore: vi.fn(),
  parsePaddleWebhookBody: vi.fn(),
  verifyPaddleWebhook: vi.fn(),
  resolvePaddleUserOwner: vi.fn(),
  resolvePaddleSubscriptionOwner: vi.fn(),
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

vi.mock('@interdomestik/database/paddle-provider-resolution', () => ({
  resolvePaddleUserOwner: hoisted.resolvePaddleUserOwner,
  resolvePaddleSubscriptionOwner: hoisted.resolvePaddleSubscriptionOwner,
}));

vi.mock('@interdomestik/database', () => {
  const db = { query: { subscriptions: { findFirst: hoisted.dbSubscriptionFindFirst } } };
  return { db, withTenantContext: async (_ctx: unknown, cb: (tx: unknown) => unknown) => cb(db) };
});

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
    hoisted.resolvePaddleUserOwner.mockResolvedValue({
      userId: 'user_owner',
      tenantId: 'tenant_ks',
    });
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValue(null);
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
