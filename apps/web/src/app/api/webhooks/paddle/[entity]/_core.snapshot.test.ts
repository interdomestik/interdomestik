import type { IngressCapability } from '@interdomestik/database/ingress';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authorizePaddleTenant: vi.fn(),
  dbSubscriptionFindFirst: vi.fn(),
  withTenantContext: vi.fn(),
  resolvePaddleSubscriptionOwner: vi.fn(),
  resolvePaddleUserOwner: vi.fn(),
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

vi.mock('@interdomestik/database', () => {
  const db = { query: { subscriptions: { findFirst: hoisted.dbSubscriptionFindFirst } } };
  return {
    db,
    withTenantContext: hoisted.withTenantContext,
    authorizePaddleTenant: hoisted.authorizePaddleTenant,
    resolvePaddleSubscriptionOwner: hoisted.resolvePaddleSubscriptionOwner,
    resolvePaddleUserOwner: hoisted.resolvePaddleUserOwner,
  };
});

import { handlePaddleWebhookEntityCore } from './_core';

// Stand-in for the verified-delivery capability `verifyPaddleWebhook` mints.
const TEST_PADDLE_DELIVERY = Object.freeze({}) as IngressCapability<'paddle-delivery'>;

describe('handlePaddleWebhookEntityCore billing snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.authorizePaddleTenant.mockImplementation(
      (_delivery: unknown, owner: { tenantId: string }) => mintTestTenantAuthority(owner.tenantId)
    );
    hoisted.withTenantContext.mockImplementation(
      async (_ctx: unknown, cb: (tx: unknown) => unknown) =>
        cb({ query: { subscriptions: { findFirst: hoisted.dbSubscriptionFindFirst } } })
    );
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
      delivery: TEST_PADDLE_DELIVERY,
      signatureValid: true,
    });
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValue({
      subscriptionId: 'sub_internal_mk',
      tenantId: 'tenant_ks',
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
    expect(hoisted.resolvePaddleSubscriptionOwner).toHaveBeenCalledWith('sub_paddle_mk');
    // The preflight reads the stored snapshot under the authority minted for the verified delivery.
    const owner = await hoisted.resolvePaddleSubscriptionOwner.mock.results[0]!.value;
    expect(hoisted.authorizePaddleTenant).toHaveBeenCalledWith(TEST_PADDLE_DELIVERY, owner);
    expect(hoisted.authorizePaddleTenant.mock.calls[0]![1]).toBe(owner);
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      hoisted.authorizePaddleTenant.mock.results[0]!.value,
      expect.any(Function)
    );
    expect(hoisted.dbSubscriptionFindFirst).toHaveBeenCalledTimes(1);
    expect(hoisted.resolvePaddleUserOwner).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledWith(
      expect.objectContaining({ billingEntity: 'mk' })
    );
  });
});
