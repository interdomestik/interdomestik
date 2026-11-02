import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { dbAdmin } from './db';
import { webhookEvents } from './schema/webhooks';

// Paddle webhook receipts are written before the event's tenant is known (tenant_id may be null),
// so the restricted runtime role cannot write them. These are the only receipt commands: append
// invalid-signature evidence, admit a verified receipt (insert or reclaim), and complete the lease
// that admission granted. No command accepts a row id alone as authority for a terminal write.

const INVALID_SIGNATURE_NAMESPACE = 'invalid-signature:';
const RECOVERABLE_LEASE_STALE_MS = 5 * 60 * 1000;

export type PaddleReceiptEvidence = {
  processingScopeKey: string;
  dedupeKey: string;
  eventType: string | null;
  eventId: string | null;
  eventTimestamp: Date | null;
  payloadHash: string;
  payload: Record<string, unknown>;
};

/** Proof of one admitted processing attempt; only its holder can write the terminal result. */
export type PaddleReceiptLease = { readonly id: string; readonly leaseStartedAt: Date };

export type PaddleReceiptAdmission =
  | { outcome: 'admitted'; lease: PaddleReceiptLease; reclaimed: boolean }
  | { outcome: 'in_progress'; receiptId: string }
  | { outcome: 'duplicate' };

export type PaddleReceiptCompletion =
  { result: 'ok' } | { result: 'error' | 'retryable_error'; error: string };

/**
 * Append-only evidence of an unverified request. It lives in its own scope/dedupe namespace so it
 * can never occupy the uniqueness slots of the genuine verified receipt, never carries a tenant,
 * and is never signature-valid, so no lifecycle command can admit or complete it.
 */
export async function appendPaddleInvalidSignatureEvidence(
  evidence: PaddleReceiptEvidence
): Promise<void> {
  // db-access-guard: system-exempt -- reason: append-only unverified Paddle evidence in a separate namespace; no tenant, never processed
  await dbAdmin
    .insert(webhookEvents)
    .values({
      id: nanoid(),
      tenantId: null,
      provider: 'paddle',
      processingScopeKey: `${INVALID_SIGNATURE_NAMESPACE}${evidence.processingScopeKey}`,
      dedupeKey: `${INVALID_SIGNATURE_NAMESPACE}${evidence.dedupeKey}`,
      eventType: evidence.eventType,
      eventId: evidence.eventId,
      signatureValid: false,
      eventTimestamp: evidence.eventTimestamp,
      payloadHash: evidence.payloadHash,
      payload: evidence.payload,
    })
    .onConflictDoNothing();
}

function hasRecoverableLease(evidence: PaddleReceiptEvidence): boolean {
  return (
    evidence.eventType === 'subscription.created' ||
    (evidence.eventType === 'subscription.past_due' &&
      evidence.processingScopeKey.startsWith('entity:'))
  );
}

function exactVerifiedEvidence(evidence: PaddleReceiptEvidence) {
  return [
    eq(webhookEvents.provider, 'paddle'),
    eq(webhookEvents.dedupeKey, evidence.dedupeKey),
    eq(webhookEvents.processingScopeKey, evidence.processingScopeKey),
    eq(webhookEvents.payloadHash, evidence.payloadHash),
    eq(webhookEvents.signatureValid, true),
  ];
}

/**
 * Admits a verified (or explicitly bypassed) receipt. A new receipt is inserted; an existing one is
 * reclaimed only by compare-and-set on the exact verified evidence when it failed retryably or its
 * recoverable lease went stale. Each admission starts a new lease, which invalidates older ones.
 */
export async function admitVerifiedPaddleReceipt(
  evidence: PaddleReceiptEvidence & {
    providerTransactionId: string | null;
    tenantId: string | null;
  }
): Promise<PaddleReceiptAdmission> {
  const leaseStartedAt = new Date();

  // db-access-guard: system-exempt -- reason: verified Paddle receipt admission before tenant processing; tenant may be unresolved
  const inserted = await dbAdmin
    .insert(webhookEvents)
    .values({
      id: nanoid(),
      tenantId: evidence.tenantId,
      provider: 'paddle',
      processingScopeKey: evidence.processingScopeKey,
      dedupeKey: evidence.dedupeKey,
      eventType: evidence.eventType,
      eventId: evidence.eventId,
      providerTransactionId: evidence.providerTransactionId,
      signatureValid: true,
      receivedAt: leaseStartedAt,
      eventTimestamp: evidence.eventTimestamp,
      payloadHash: evidence.payloadHash,
      payload: evidence.payload,
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (inserted[0]) {
    return { outcome: 'admitted', lease: { id: inserted[0].id, leaseStartedAt }, reclaimed: false };
  }

  const staleBefore = new Date(leaseStartedAt.getTime() - RECOVERABLE_LEASE_STALE_MS);
  // db-access-guard: system-exempt -- reason: compare-and-set reclaims only the exact verified failed receipt or a stale recoverable lease
  const reclaimed = await dbAdmin
    .update(webhookEvents)
    .set({ receivedAt: leaseStartedAt, processedAt: null, processingResult: null, error: null })
    .where(
      and(
        ...exactVerifiedEvidence(evidence),
        or(
          eq(webhookEvents.processingResult, 'retryable_error'),
          hasRecoverableLease(evidence)
            ? and(
                eq(webhookEvents.eventType, evidence.eventType ?? ''),
                isNull(webhookEvents.processingResult),
                lt(webhookEvents.receivedAt, staleBefore)
              )
            : undefined
        )
      )
    )
    .returning({ id: webhookEvents.id });
  if (reclaimed[0]) {
    return { outcome: 'admitted', lease: { id: reclaimed[0].id, leaseStartedAt }, reclaimed: true };
  }

  if (hasRecoverableLease(evidence)) {
    // db-access-guard: system-exempt -- reason: exact verified receipt evidence distinguishes an active lease from a terminal duplicate
    const [active] = await dbAdmin
      .select({ id: webhookEvents.id })
      .from(webhookEvents)
      .where(
        and(
          ...exactVerifiedEvidence(evidence),
          eq(webhookEvents.eventType, evidence.eventType ?? ''),
          or(
            isNull(webhookEvents.processingResult),
            eq(webhookEvents.processingResult, 'retryable_error')
          )
        )
      )
      .limit(1);
    if (active) return { outcome: 'in_progress', receiptId: active.id };
  }

  return { outcome: 'duplicate' };
}

/**
 * Writes the terminal result for exactly the lease that admission granted. A worker whose lease
 * was reclaimed (receivedAt moved on) or already completed matches no row and returns false.
 */
export async function completePaddleReceiptLease(
  lease: PaddleReceiptLease,
  completion: PaddleReceiptCompletion
): Promise<boolean> {
  // db-access-guard: system-exempt -- reason: terminal write bound to the admitted lease (id + lease start + open state)
  const updated = await dbAdmin
    .update(webhookEvents)
    .set({
      processedAt: new Date(),
      processingResult: completion.result,
      error: completion.result === 'ok' ? null : completion.error.slice(0, 2000),
    })
    .where(
      and(
        eq(webhookEvents.id, lease.id),
        eq(webhookEvents.receivedAt, lease.leaseStartedAt),
        isNull(webhookEvents.processingResult),
        eq(webhookEvents.signatureValid, true)
      )
    )
    .returning({ id: webhookEvents.id });
  return updated.length > 0;
}
