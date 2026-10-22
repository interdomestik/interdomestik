import type { subscriptions } from '@interdomestik/database';

export type CanonicalPaddleUser = {
  tenantId: string;
  email: string;
  name: string;
  memberNumber: string | null;
  agentId: string | null;
};

/** Fixed, signed-envelope-bound canonical lookups; no database handle crosses this port. */
export type PaddleWebhookIdentityReader = {
  subscription(
    reference: string
  ): Promise<Pick<
    typeof subscriptions.$inferSelect,
    | 'id'
    | 'status'
    | 'tenantId'
    | 'userId'
    | 'providerSubscriptionId'
    | 'legalTenantId'
    | 'billingEntity'
  > | null>;
  user(userId: string): Promise<CanonicalPaddleUser | null>;
};
