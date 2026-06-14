import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  dbSubscriptionFindFirst: vi.fn(),
  dbUserFindFirst: vi.fn(),
  handlePaddleWebhookCore: vi.fn(),
  parsePaddleWebhookBody: vi.fn(),
  verifyPaddleWebhook: vi.fn(),
}));

vi.mock('../_core', () => ({ handlePaddleWebhookCore: hoisted.handlePaddleWebhookCore }));
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
      subscriptions: { findFirst: hoisted.dbSubscriptionFindFirst },
      user: { findFirst: hoisted.dbUserFindFirst },
    },
  },
}));

import { handlePaddleWebhookEntityCore } from './_core';

describe('handlePaddleWebhookEntityCore billing snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.handlePaddleWebhookCore.mockResolvedValue({ status: 200, body: { success: true } });
    hoisted.parsePaddleWebhookBody.mockReturnValue({
      eventIdFromPayload: 'evt_mk',
      eventTimestampFromPayload: new Date('2026-02-23T00:00:00.000Z'),
      eventTypeFromPayload: 'transaction.completed',
      parsedPayload: { data: {}, event_type: 'transaction.completed' },
    });
  });

  it('uses the stored subscription billing snapshot before custom tenant metadata', async () => {
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        data: {
          customData: { tenantId: 'tenant_ks', userId: 'user_ks' },
          subscriptionId: 'sub_paddle_mk',
        },
        eventId: 'evt_mk',
        eventType: 'transaction.completed',
      },
      signatureBypassed: false,
      signatureValid: true,
    });
    hoisted.dbSubscriptionFindFirst.mockResolvedValue({
      billingEntity: 'mk',
      legalTenantId: 'tenant_mk',
      tenantId: 'tenant_ks',
      userId: 'user_ks',
    });

    const result = await handlePaddleWebhookEntityCore({
      bodyText: '{"event_type":"transaction.completed"}',
      expectedEntity: 'mk',
      headers: new Headers({ 'paddle-signature': 'sig_mk' }),
      paddle: { mocked: true } as never,
      secret: 'whsec_mk',
      signature: 'sig_mk',
    });

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.dbSubscriptionFindFirst).toHaveBeenCalledTimes(1);
    expect(hoisted.dbUserFindFirst).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledWith(
      expect.objectContaining({ billingEntity: 'mk' })
    );
  });
});
