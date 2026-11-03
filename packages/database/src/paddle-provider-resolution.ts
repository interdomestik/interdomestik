import { and, asc, eq, or } from 'drizzle-orm';
import { dbAdmin } from './db';
import { user } from './schema/auth';
import { subscriptions } from './schema/subscriptions';
import { webhookEvents } from './schema/webhooks';
import { registerResolvedPaddleOwner } from './paddle-tenant-authority';

// A Paddle webhook names its subject by provider references (subscription id, checkout customData
// userId, customer email, transaction id) before any tenant is known. These fixed lookups map one
// exact reference to its owning tenant and record id; every ambiguous match resolves to nothing.
// They do not make provider-supplied customData authoritative: callers keep their existing
// subscription/user/tenant/customer cross-checks and must re-read the record inside
// withTenantContext before any effect. Results are internal to webhook processing.

// Owners are frozen and registered, so authorizePaddleTenant can tell them from caller-built objects.
export type PaddleSubscriptionOwner = Readonly<{ subscriptionId: string; tenantId: string }>;
export type PaddleUserOwner = Readonly<{ userId: string; tenantId: string }>;

/**
 * Exact subscription reference to its owner. One row's id can equal another row's provider
 * reference, so two matches return `ambiguous`, which callers must treat as a terminal conflict
 * rather than as "not found" (a not-found result may legitimately fall back to other evidence).
 */
export async function resolvePaddleSubscriptionOwner(
  reference: string
): Promise<PaddleSubscriptionOwner | 'ambiguous' | null> {
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
  if (rows.length > 1) return 'ambiguous';
  return rows[0] ? registerResolvedPaddleOwner(rows[0]) : null;
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
  return rows.length === 1 ? registerResolvedPaddleOwner(rows[0]) : null;
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
  return rows[0] ? registerResolvedPaddleOwner(rows[0]) : null;
}

export type PaddleTransactionEvidence = {
  payload: Record<string, unknown>;
  processingResult: string | null;
};

const LEGACY_EVIDENCE_CANDIDATE_LIMIT = 10;

/**
 * Verified transaction receipt evidence for checkout reconciliation.
 *
 * Entity routes bind provider, signature, event type `transaction.completed` and the exact
 * processing scope; the unique (provider, scope, transaction) index admits at most one row.
 *
 * The legacy route keeps its transaction-id match narrowed to verified Paddle receipts, with a
 * deterministic selection contract instead of an arbitrary first row:
 *   1. the receipt in the caller's own processing scope, when it exists (unique by the index);
 *   2. otherwise receipts from other scopes only when every candidate carries the identical payload
 *      (the same signed provider delivery recorded under several scopes);
 *   3. otherwise, differing payloads or more candidates than the bound, nothing.
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
  const evidenceColumns = {
    payload: webhookEvents.payload,
    processingResult: webhookEvents.processingResult,
    processingScopeKey: webhookEvents.processingScopeKey,
    payloadHash: webhookEvents.payloadHash,
  };

  if (args.entityRoute) {
    // db-access-guard: system-exempt -- reason: verified Paddle transaction evidence bootstraps checkout reconciliation before user context exists
    const rows = await dbAdmin
      .select(evidenceColumns)
      .from(webhookEvents)
      .where(
        and(
          ...verified,
          eq(webhookEvents.eventType, 'transaction.completed'),
          eq(webhookEvents.processingScopeKey, args.processingScopeKey)
        )
      )
      .limit(2);
    return rows.length === 1 ? toEvidence(rows[0]) : null;
  }

  // db-access-guard: system-exempt -- reason: verified Paddle transaction evidence bootstraps legacy checkout reconciliation before user context exists
  const candidates = await dbAdmin
    .select(evidenceColumns)
    .from(webhookEvents)
    .where(and(...verified))
    .orderBy(asc(webhookEvents.receivedAt), asc(webhookEvents.id))
    .limit(LEGACY_EVIDENCE_CANDIDATE_LIMIT + 1);
  if (candidates.length === 0 || candidates.length > LEGACY_EVIDENCE_CANDIDATE_LIMIT) return null;

  const ownScope = candidates.filter(row => row.processingScopeKey === args.processingScopeKey);
  if (ownScope.length === 1) return toEvidence(ownScope[0]);
  if (ownScope.length > 1) return null;

  const [first] = candidates;
  return candidates.every(row => row.payloadHash === first.payloadHash) ? toEvidence(first) : null;
}

function toEvidence(row: {
  payload: Record<string, unknown>;
  processingResult: string | null;
}): PaddleTransactionEvidence {
  return { payload: row.payload, processingResult: row.processingResult };
}
