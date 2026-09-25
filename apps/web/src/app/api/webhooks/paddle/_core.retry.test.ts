import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  dbUserFindFirst: vi.fn(),
  findSubscriptionByProviderReference: vi.fn(),
  handlePaddleEvent: vi.fn(),
  insertWebhookEvent: vi.fn(),
  isRetryablePaddleWebhookError: vi.fn(() => false),
  markWebhookFailed: vi.fn(),
  markWebhookProcessed: vi.fn(),
  membershipConfirmationDeliveryStore: {},
  parsePaddleWebhookBody: vi.fn(),
  persistInvalidSignatureAttempt: vi.fn(),
  persistInvoiceAndLedgerInvariants: vi.fn(),
  sha256Hex: vi.fn(),
  verifyPaddleWebhook: vi.fn(),
}));

vi.mock('@/actions/thank-you-letter/send', () => ({ sendThankYouLetterCore: vi.fn() }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { requestPasswordReset: vi.fn() } } }));
vi.mock('@/lib/email', () => ({ sendPaymentFailedEmail: vi.fn() }));
vi.mock('@interdomestik/database', () => ({
  db: { query: { user: { findFirst: hoisted.dbUserFindFirst } } },
}));
vi.mock('@interdomestik/domain-membership-billing/subscription', () => ({
  findSubscriptionByProviderReference: hoisted.findSubscriptionByProviderReference,
}));
vi.mock('@interdomestik/domain-membership-billing/paddle-webhooks', () => ({
  handlePaddleEvent: hoisted.handlePaddleEvent,
  insertWebhookEvent: hoisted.insertWebhookEvent,
  markWebhookFailed: hoisted.markWebhookFailed,
  markWebhookProcessed: hoisted.markWebhookProcessed,
  parsePaddleWebhookBody: hoisted.parsePaddleWebhookBody,
  persistInvoiceAndLedgerInvariants: hoisted.persistInvoiceAndLedgerInvariants,
  persistInvalidSignatureAttempt: hoisted.persistInvalidSignatureAttempt,
  sha256Hex: hoisted.sha256Hex,
  verifyPaddleWebhook: hoisted.verifyPaddleWebhook,
}));
vi.mock(
  '@interdomestik/domain-membership-billing/paddle-webhooks/membership-confirmation-delivery',
  () => ({
    membershipConfirmationDeliveryStore: hoisted.membershipConfirmationDeliveryStore,
  })
);
vi.mock('@interdomestik/domain-membership-billing/paddle-webhooks/persist', () => ({
  isRetryablePaddleWebhookError: hoisted.isRetryablePaddleWebhookError,
}));
vi.mock('@interdomestik/domain-leads', () => ({
  convertLeadToMember: vi.fn(),
  hasTenantLeadForConversion: vi.fn(),
}));

import { handlePaddleWebhookCore } from './_core';

async function callCore() {
  return handlePaddleWebhookCore({
    paddle: {} as never,
    headers: new Headers(),
    signature: 'paddle-signature',
    secret: 'paddle-secret',
    bodyText: '{"event":"payload"}',
    billingEntity: 'mk',
  });
}

describe('handlePaddleWebhookCore retry contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.sha256Hex.mockReturnValue('payload_hash');
    hoisted.parsePaddleWebhookBody.mockReturnValue({
      parsedPayload: { data: {} },
      eventTypeFromPayload: 'subscription.created',
      eventIdFromPayload: 'evt_retry',
      eventTimestampFromPayload: null,
    });
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'subscription.created',
        eventId: 'evt_retry',
        data: {
          id: 'sub_retry',
          customerId: 'ctm_01hrffh7gvp29kc7xahm8wddwa',
          customData: { tenantId: 'tenant_mk' },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
    });
    hoisted.findSubscriptionByProviderReference.mockResolvedValue(null);
    hoisted.dbUserFindFirst.mockResolvedValue(null);
    hoisted.insertWebhookEvent.mockResolvedValue({
      inserted: true,
      webhookEventRowId: 'webhook_event_1',
    });
    hoisted.persistInvoiceAndLedgerInvariants.mockResolvedValue(undefined);
    hoisted.handlePaddleEvent.mockResolvedValue(undefined);
    hoisted.markWebhookProcessed.mockResolvedValue(undefined);
  });

  it('forwards the trusted entity processing scope into domain handling', async () => {
    await expect(callCore()).resolves.toEqual({ status: 200, body: { success: true } });
    expect(hoisted.handlePaddleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ processingScopeKey: 'entity:mk' }),
      expect.any(Object)
    );
  });

  it('binds delivery persistence to the verified event identity', async () => {
    await expect(callCore()).resolves.toEqual({ status: 200, body: { success: true } });
    expect(hoisted.handlePaddleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        providerEventId: 'evt_retry',
        webhookPayloadHash: 'payload_hash',
      }),
      expect.objectContaining({
        membershipConfirmationDelivery: hoisted.membershipConfirmationDeliveryStore,
      })
    );
  });

  it('persists typed pre-write deferrals as retryable failures', async () => {
    hoisted.handlePaddleEvent.mockRejectedValueOnce(new Error('verified dependency not ready'));
    hoisted.isRetryablePaddleWebhookError.mockReturnValueOnce(true);

    await expect(callCore()).rejects.toThrow('verified dependency not ready');
    expect(hoisted.markWebhookFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookEventRowId: 'webhook_event_1',
        retryable: true,
      }),
      expect.any(Object)
    );
    expect(hoisted.markWebhookProcessed).not.toHaveBeenCalled();
  });

  it('keeps unexpected processing failures permanent', async () => {
    hoisted.handlePaddleEvent.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(callCore()).rejects.toThrow('database unavailable');
    expect(hoisted.markWebhookFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookEventRowId: 'webhook_event_1',
        retryable: false,
      }),
      expect.any(Object)
    );
    expect(hoisted.markWebhookProcessed).not.toHaveBeenCalled();
  });

  it('preserves invalid-signature persistence before processing', async () => {
    hoisted.verifyPaddleWebhook.mockRejectedValueOnce(new Error('Invalid signature'));

    await expect(callCore()).resolves.toEqual({
      status: 401,
      body: { error: 'Invalid signature' },
    });
    expect(hoisted.persistInvalidSignatureAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'subscription.created',
        eventId: 'evt_retry',
        processingScopeKey: 'entity:mk',
      }),
      expect.any(Object)
    );
    expect(hoisted.insertWebhookEvent).not.toHaveBeenCalled();
  });
});
