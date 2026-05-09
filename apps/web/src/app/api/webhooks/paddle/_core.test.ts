import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  dbUserFindFirst: vi.fn(),
  convertLeadToMember: vi.fn(),
  hasTenantLeadForConversion: vi.fn(),
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

vi.mock('@interdomestik/domain-leads', () => ({
  convertLeadToMember: hoisted.convertLeadToMember,
  hasTenantLeadForConversion: hoisted.hasTenantLeadForConversion,
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

async function callPaddleWebhookCore() {
  return handlePaddleWebhookCore({
    paddle: {} as never,
    headers: new Headers(),
    signature: 'paddle-signature',
    secret: 'paddle-secret',
    bodyText: '{"event":"payload"}',
  });
}

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

describe('handlePaddleWebhookCore lead conversion', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.sha256Hex.mockReturnValue('payload_hash');
    hoisted.parsePaddleWebhookBody.mockReturnValue({
      parsedPayload: {
        event_type: 'transaction.completed',
        event_id: 'evt_payload',
        data: {
          id: 'txn_payload_1',
          subscriptionId: 'sub_provider_1',
          customData: { leadId: 'lead_payload_1' },
        },
      },
      eventTypeFromPayload: 'transaction.completed',
      eventIdFromPayload: 'evt_payload',
      eventTimestampFromPayload: null,
    });
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'transaction.completed',
        eventId: 'evt_verified',
        data: {
          id: 'txn_verified_1',
          subscriptionId: 'sub_provider_1',
          customData: { leadId: 'lead_1' },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
    });
    hoisted.findSubscriptionByProviderReference.mockResolvedValue({
      id: 'sub_internal_1',
      tenantId: 'tenant_1',
      userId: 'user_1',
    });
    hoisted.dbUserFindFirst.mockResolvedValue(null);
    hoisted.insertWebhookEvent.mockResolvedValue({
      inserted: true,
      webhookEventRowId: 'webhook_event_1',
    });
    hoisted.persistInvoiceAndLedgerInvariants.mockResolvedValue(undefined);
    hoisted.hasTenantLeadForConversion.mockResolvedValue(true);
    hoisted.convertLeadToMember.mockResolvedValue({
      userId: 'member_user_1',
      createdSubscriptionId: 'membership_1',
    });
    hoisted.handlePaddleEvent.mockResolvedValue(undefined);
    hoisted.markWebhookProcessed.mockResolvedValue(undefined);
    hoisted.markWebhookFailed.mockResolvedValue(undefined);
  });

  it('converts a canonical tenant-scoped lead for transaction.completed', async () => {
    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.hasTenantLeadForConversion).toHaveBeenCalledWith(
      { tenantId: 'tenant_1' },
      { leadId: 'lead_1' }
    );
    expect(hoisted.convertLeadToMember).toHaveBeenCalledWith(
      { tenantId: 'tenant_1' },
      { leadId: 'lead_1' }
    );
    expect(hoisted.handlePaddleEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.markWebhookProcessed).toHaveBeenCalledTimes(1);
    expect(hoisted.markWebhookFailed).not.toHaveBeenCalled();
  });

  it('skips lead conversion when the webhook cannot resolve a canonical tenant', async () => {
    hoisted.findSubscriptionByProviderReference.mockResolvedValue(null);
    hoisted.dbUserFindFirst.mockResolvedValue(null);

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.insertWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: null,
        processingScopeKey: 'global',
      }),
      expect.any(Object)
    );
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.markWebhookProcessed).toHaveBeenCalledTimes(1);
  });

  it('skips lead conversion for missing, empty, or malformed provider lead IDs', async () => {
    for (const leadId of [undefined, '', '   ', '../lead_1', 'lead 1']) {
      vi.clearAllMocks();
      hoisted.sha256Hex.mockReturnValue('payload_hash');
      hoisted.parsePaddleWebhookBody.mockReturnValue({
        parsedPayload: { data: {} },
        eventTypeFromPayload: 'transaction.completed',
        eventIdFromPayload: 'evt_payload',
        eventTimestampFromPayload: null,
      });
      hoisted.verifyPaddleWebhook.mockResolvedValue({
        eventData: {
          eventType: 'transaction.completed',
          eventId: 'evt_verified',
          data: {
            id: 'txn_verified_1',
            subscriptionId: 'sub_provider_1',
            customData: { leadId },
          },
        },
        signatureValid: true,
        signatureBypassed: false,
      });
      hoisted.findSubscriptionByProviderReference.mockResolvedValue({ tenantId: 'tenant_1' });
      hoisted.insertWebhookEvent.mockResolvedValue({
        inserted: true,
        webhookEventRowId: 'webhook_event_1',
      });
      hoisted.persistInvoiceAndLedgerInvariants.mockResolvedValue(undefined);
      hoisted.hasTenantLeadForConversion.mockResolvedValue(true);
      hoisted.handlePaddleEvent.mockResolvedValue(undefined);
      hoisted.markWebhookProcessed.mockResolvedValue(undefined);

      const result = await callPaddleWebhookCore();

      expect(result).toEqual({ status: 200, body: { success: true } });
      expect(hoisted.hasTenantLeadForConversion).not.toHaveBeenCalled();
      expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
      expect(hoisted.handlePaddleEvent).toHaveBeenCalledTimes(1);
      expect(hoisted.markWebhookProcessed).toHaveBeenCalledTimes(1);
    }
  });

  it('skips conversion when canonical lead ownership does not match the resolved tenant', async () => {
    hoisted.hasTenantLeadForConversion.mockResolvedValueOnce(false);

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.hasTenantLeadForConversion).toHaveBeenCalledWith(
      { tenantId: 'tenant_1' },
      { leadId: 'lead_1' }
    );
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.markWebhookProcessed).toHaveBeenCalledTimes(1);
    expect(hoisted.markWebhookFailed).not.toHaveBeenCalled();
  });

  it('uses subscriptionId before transaction id for canonical tenant resolution', async () => {
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'transaction.completed',
        eventId: 'evt_verified',
        data: {
          id: 'txn_verified_1',
          subscriptionId: 'sub_provider_1',
          customData: { userId: 'canonical_user', leadId: 'lead_1' },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
    });
    hoisted.findSubscriptionByProviderReference.mockImplementation(async reference =>
      reference === 'sub_provider_1'
        ? { id: 'sub_internal_1', tenantId: 'tenant_from_subscription', userId: 'canonical_user' }
        : null
    );
    hoisted.hasTenantLeadForConversion.mockResolvedValueOnce(true);

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.findSubscriptionByProviderReference).toHaveBeenCalledWith('sub_provider_1');
    expect(hoisted.findSubscriptionByProviderReference).not.toHaveBeenCalledWith('txn_verified_1');
    expect(hoisted.dbUserFindFirst).not.toHaveBeenCalled();
    expect(hoisted.convertLeadToMember).toHaveBeenCalledWith(
      { tenantId: 'tenant_from_subscription' },
      { leadId: 'lead_1' }
    );
  });

  it('skips lead conversion when provider user metadata conflicts with canonical subscription', async () => {
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'transaction.completed',
        eventId: 'evt_verified',
        data: {
          id: 'txn_verified_1',
          subscriptionId: 'sub_provider_1',
          customData: { userId: 'user_bad', leadId: 'lead_1' },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
    });
    hoisted.findSubscriptionByProviderReference.mockResolvedValue({
      id: 'sub_internal_1',
      tenantId: 'tenant_1',
      userId: 'user_real',
    });

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.hasTenantLeadForConversion).not.toHaveBeenCalled();
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.markWebhookProcessed).toHaveBeenCalledTimes(1);
    expect(hoisted.markWebhookFailed).not.toHaveBeenCalled();
  });

  it('skips lead conversion when provider user metadata cannot be reconciled to subscription user', async () => {
    hoisted.findSubscriptionByProviderReference.mockResolvedValue({
      id: 'sub_internal_1',
      tenantId: 'tenant_1',
      userId: null,
    });
    hoisted.verifyPaddleWebhook.mockResolvedValue({
      eventData: {
        eventType: 'transaction.completed',
        eventId: 'evt_verified',
        data: {
          id: 'txn_verified_1',
          subscriptionId: 'sub_provider_1',
          customData: { userId: 'user_unproven', leadId: 'lead_1' },
        },
      },
      signatureValid: true,
      signatureBypassed: false,
    });

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(hoisted.hasTenantLeadForConversion).not.toHaveBeenCalled();
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.markWebhookProcessed).toHaveBeenCalledTimes(1);
  });

  it('does not run lead conversion for duplicate webhook receipts', async () => {
    hoisted.insertWebhookEvent.mockResolvedValue({
      inserted: false,
      webhookEventRowId: null,
    });

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 200, body: { success: true, duplicate: true } });
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
    expect(hoisted.handlePaddleEvent).not.toHaveBeenCalled();
    expect(hoisted.markWebhookProcessed).not.toHaveBeenCalled();
  });

  it('preserves invalid-signature persistence without lead conversion', async () => {
    hoisted.verifyPaddleWebhook.mockRejectedValueOnce(new Error('Invalid signature'));
    hoisted.persistInvalidSignatureAttempt.mockResolvedValueOnce({
      inserted: true,
      webhookEventRowId: 'webhook_event_invalid_1',
    });

    const result = await callPaddleWebhookCore();

    expect(result).toEqual({ status: 401, body: { error: 'Invalid signature' } });
    expect(hoisted.persistInvalidSignatureAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'transaction.completed',
        eventId: 'evt_payload',
        processingScopeKey: 'global',
      }),
      expect.any(Object)
    );
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
    expect(hoisted.insertWebhookEvent).not.toHaveBeenCalled();
  });

  it('marks the webhook failed for unexpected conversion errors', async () => {
    hoisted.convertLeadToMember.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(callPaddleWebhookCore()).rejects.toThrow('database unavailable');

    expect(hoisted.markWebhookFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookEventRowId: 'webhook_event_1',
        eventType: 'transaction.completed',
        eventId: 'evt_verified',
        tenantId: 'tenant_1',
      }),
      expect.any(Object)
    );
    expect(hoisted.handlePaddleEvent).not.toHaveBeenCalled();
    expect(hoisted.markWebhookProcessed).not.toHaveBeenCalled();
  });
});
