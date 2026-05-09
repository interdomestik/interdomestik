import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  dbUserFindFirst: vi.fn(),
  findSubscriptionByProviderReference: vi.fn(),
  handlePaddleEvent: vi.fn(),
  insertWebhookEvent: vi.fn(),
  markWebhookFailed: vi.fn(),
  markWebhookProcessed: vi.fn(),
  parsePaddleWebhookBody: vi.fn(),
  persistInvalidSignatureAttempt: vi.fn(),
  persistInvoiceAndLedgerInvariants: vi.fn(),
  sha256Hex: vi.fn(),
  verifyPaddleWebhook: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      requestPasswordReset: hoisted.requestPasswordReset,
    },
  },
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      user: {
        findFirst: hoisted.dbUserFindFirst,
      },
    },
  },
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
  persistInvalidSignatureAttempt: hoisted.persistInvalidSignatureAttempt,
  persistInvoiceAndLedgerInvariants: hoisted.persistInvoiceAndLedgerInvariants,
  sha256Hex: hoisted.sha256Hex,
  verifyPaddleWebhook: hoisted.verifyPaddleWebhook,
}));

vi.mock('@/actions/thank-you-letter/send', () => ({
  sendThankYouLetterCore: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendPaymentFailedEmail: vi.fn(),
}));

import {
  buildTenantPasswordResetRedirectUrl,
  handlePaddleWebhookCore,
  requestPasswordResetOnboarding,
} from './_core';

describe('paddle webhook onboarding helpers', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalKsHost = process.env.KS_HOST;
  const originalMkHost = process.env.MK_HOST;
  const originalDefaultPublicTenantId = process.env.DEFAULT_PUBLIC_TENANT_ID;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    mutableEnv.KS_HOST = originalKsHost;
    mutableEnv.MK_HOST = originalMkHost;
    mutableEnv.DEFAULT_PUBLIC_TENANT_ID = originalDefaultPublicTenantId;
    mutableEnv.NODE_ENV = originalNodeEnv;
    mutableEnv.VERCEL_ENV = originalVercelEnv;
  });

  it('builds a tenant-specific reset password URL', () => {
    delete mutableEnv.MK_HOST;
    mutableEnv.NODE_ENV = 'development';
    delete mutableEnv.VERCEL_ENV;

    expect(buildTenantPasswordResetRedirectUrl('tenant_mk')).toBe(
      'http://mk.localhost/mk/reset-password'
    );
  });

  it('falls back to the configured default public tenant for invalid tenant IDs', () => {
    mutableEnv.DEFAULT_PUBLIC_TENANT_ID = 'tenant_al';
    mutableEnv.AL_HOST = 'al.example.test';

    expect(buildTenantPasswordResetRedirectUrl('not-a-tenant')).toBe(
      'https://al.example.test/sq/reset-password'
    );
  });

  it('requests password reset onboarding with tenant-specific redirect', async () => {
    mutableEnv.KS_HOST = 'ks.example.test';

    await requestPasswordResetOnboarding({
      email: 'member@example.com',
      tenantId: 'tenant_ks',
    });

    expect(hoisted.requestPasswordReset).toHaveBeenCalledWith({
      body: {
        email: 'member@example.com',
        redirectTo: 'https://ks.example.test/sq/reset-password',
      },
    });
  });
});

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

  async function callCore() {
    return handlePaddleWebhookCore({
      paddle: {} as never,
      headers: new Headers(),
      signature: 'paddle-signature',
      secret: 'paddle-secret',
      bodyText: '{"event":"payload"}',
    });
  }

  it('prefers canonical subscription tenant over provider customData user fallback', async () => {
    hoisted.findSubscriptionByProviderReference.mockResolvedValue({
      id: 'sub_internal_1',
      tenantId: 'tenant_from_subscription',
      userId: 'canonical_user',
    });

    const result = await callCore();

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
    const result = await callCore();

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
});
