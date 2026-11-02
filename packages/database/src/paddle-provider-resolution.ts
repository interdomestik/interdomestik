import { and, eq, or } from 'drizzle-orm';
import { dbAdmin } from './db';
import { user } from './schema/auth';
import { subscriptions } from './schema/subscriptions';
import { webhookEvents } from './schema/webhooks';

// A Paddle webhook names its subject by provider references (subscription id, checkout customData
// userId, customer email, transaction id) before any tenant is known. These fixed lookups map one
// exact reference to its owning tenant and record id; every ambiguous match resolves to nothing.
// They do not make provider-supplied customData authoritative: callers keep their existing
// subscription/user/tenant/customer cross-checks and must re-read the record inside
// withTenantContext before any effect. Results are internal to webhook processing.

export type PaddleSubscriptionOwner = { subscriptionId: string; tenantId: string };
export type PaddleUserOwner = { userId: string; tenantId: string };

export async function resolvePaddleSubscriptionOwner(
  reference: string
): Promise<PaddleSubscriptionOwner | null> {
  const normalized = reference.trim();
  if (!normalized) return null;
  // db-access-guard: system-exempt -- reason: exact Paddle subscription reference to owning tenant/id; ambiguity resolves to nothing
  const rows = await dbAdmin
    .select({ subscriptionId: subscriptions.id, tenantId: subscriptions.tenantId })
    .from(subscriptions)
    .where(
      or(eq(subscriptions.id, normalized), eq(subscriptions.providerSubscriptionId, normalized))
    )
    .limit(2);
  return rows.length === 1 ? rows[0] : null;
}

export async function resolvePaddleUserOwner(userId: string): Promise<PaddleUserOwner | null> {
  const normalized = userId.trim();
  if (!normalized) return null;
  // db-access-guard: system-exempt -- reason: exact canonical user id to owning tenant; no profile data
  const rows = await dbAdmin
    .select({ userId: user.id, tenantId: user.tenantId })
    .from(user)
    .where(eq(user.id, normalized))
    .limit(2);
  return rows.length === 1 ? rows[0] : null;
}

/**
 * Global email ownership probe for checkout reconciliation: which tenant (if any) already owns the
 * verified customer email. Returns `ambiguous` rather than picking one owner.
 */
export async function resolvePaddleCustomerEmailOwner(
  email: string
): Promise<PaddleUserOwner | 'ambiguous' | null> {
  if (!email) return null;
  // db-access-guard: system-exempt -- reason: exact verified customer email to owning user/tenant for cross-tenant conflict detection
  const rows = await dbAdmin
    .select({ userId: user.id, tenantId: user.tenantId })
    .from(user)
    .where(eq(user.email, email))
    .limit(2);
  if (rows.length > 1) return 'ambiguous';
  return rows[0] ?? null;
}

export type PaddleTransactionEvidence = {
  payload: Record<string, unknown>;
  processingResult: string | null;
};

/**
 * Verified transaction receipt evidence for checkout reconciliation. Entity routes bind provider,
 * signature, event type and processing scope. The legacy route keeps its transaction-id match but
 * is narrowed to verified Paddle receipts, and an ambiguous match (several scopes) returns null
 * instead of an arbitrary row.
 */
export async function readVerifiedPaddleTransactionEvidence(args: {
  transactionId: string;
  processingScopeKey: string;
  entityRoute: boolean;
}): Promise<PaddleTransactionEvidence | null> {
  const verified = [
    eq(webhookEvents.providerTransactionId, args.transactionId),
    eq(webhookEvents.provider, 'paddle'),
    eq(webhookEvents.signatureValid, true),
  ];
  const where = args.entityRoute
    ? and(
        ...verified,
        eq(webhookEvents.eventType, 'transaction.completed'),
        eq(webhookEvents.processingScopeKey, args.processingScopeKey)
      )
    : and(...verified);
  // db-access-guard: system-exempt -- reason: verified Paddle transaction evidence bootstraps checkout reconciliation before user context exists
  const rows = await dbAdmin
    .select({ payload: webhookEvents.payload, processingResult: webhookEvents.processingResult })
    .from(webhookEvents)
    .where(where)
    .limit(2);
  return rows.length === 1 ? rows[0] : null;
}
