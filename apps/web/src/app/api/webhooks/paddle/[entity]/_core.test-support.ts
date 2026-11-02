import type { IngressCapability } from '@interdomestik/database/ingress';
import { vi } from 'vitest';

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
vi.mock('@interdomestik/database', () => {
  const db = { query: { subscriptions: { findFirst: hoisted.dbSubscriptionFindFirst } } };
  return {
    db,
    withTenantContext: async (_ctx: unknown, cb: (tx: unknown) => unknown) => cb(db),
    resolvePaddleUserOwner: hoisted.resolvePaddleUserOwner,
    resolvePaddleSubscriptionOwner: hoisted.resolvePaddleSubscriptionOwner,
  };
}); // Stand-in for the verified-delivery capability `verifyPaddleWebhook` mints.
const TEST_PADDLE_DELIVERY = Object.freeze({}) as IngressCapability<'paddle-delivery'>;

export { hoisted, TEST_PADDLE_DELIVERY };
