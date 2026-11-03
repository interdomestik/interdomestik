import type { IngressCapability } from '@interdomestik/database/ingress';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';

/**
 * Stand-in for the verified-delivery capability `verifyPaddleWebhook` mints. `authorizePaddleTenant`
 * is mocked in these tests, so an opaque frozen token is enough; tests assert it reaches the
 * producer and the handlers unchanged.
 */
const TEST_PADDLE_DELIVERY = Object.freeze({}) as IngressCapability<'paddle-delivery'>;

const hoisted = vi.hoisted(() => ({
  authorizePaddleTenant: vi.fn(),
  requestPasswordReset: vi.fn(),
  resolvePaddleUserOwner: vi.fn(),
  convertLeadToMember: vi.fn(),
  hasTenantLeadForConversion: vi.fn(),
  findPaddleSubscriptionByReference: vi.fn(),
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
  authorizePaddleTenant: hoisted.authorizePaddleTenant,
  resolvePaddleUserOwner: hoisted.resolvePaddleUserOwner,
}));

vi.mock('@interdomestik/domain-membership-billing/subscription', () => ({
  findPaddleSubscriptionByReference: hoisted.findPaddleSubscriptionByReference,
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
  paddleDunningEmailDeps: {},
}));

import { handlePaddleWebhookCore } from './_core';

// A resolver-owned subscription together with the authority it was read under.
function subscriptionLookup<T extends { tenantId: string }>(subscription: T) {
  return { subscription, authority: mintTestTenantAuthority(subscription.tenantId) };
}

// Default behaviour of the mocked producer: an authority for the owner's tenant.
function installAuthorizePaddleTenantMock() {
  hoisted.authorizePaddleTenant.mockImplementation(
    (_delivery: unknown, owner: { tenantId: string }) => mintTestTenantAuthority(owner.tenantId)
  );
}
installAuthorizePaddleTenantMock();

async function callPaddleWebhookCore() {
  return handlePaddleWebhookCore({
    paddle: {} as never,
    headers: new Headers(),
    signature: 'paddle-signature',
    secret: 'paddle-secret',
    bodyText: '{"event":"payload"}',
  });
}

/** The lease a successful receipt admission grants; terminal writes are bound to it. */
function receiptAdmission(id = 'webhook_event_1') {
  return {
    inserted: true as const,
    webhookEventRowId: id,
    receiptLease: { id, leaseStartedAt: new Date('2026-09-25T08:00:00.000Z') },
  };
}

export {
  hoisted,
  callPaddleWebhookCore,
  installAuthorizePaddleTenantMock,
  receiptAdmission,
  subscriptionLookup,
  TEST_PADDLE_DELIVERY,
};
