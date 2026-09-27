import { db, webhookEvents } from '@interdomestik/database';
import { and, eq, isNull, lt, or } from 'drizzle-orm';

type ReceiptEvidence = {
  eventType: string | undefined;
  processingScopeKey: string;
  dedupeKey: string;
  payloadHash: string;
};

function hasRecoverableLease(params: ReceiptEvidence): boolean {
  return (
    params.eventType === 'subscription.created' ||
    (params.eventType === 'subscription.past_due' &&
      params.processingScopeKey.startsWith('entity:'))
  );
}

export async function reclaimRetryableWebhookEvent(params: ReceiptEvidence) {
  const leaseStartedAt = new Date();
  const staleBefore = new Date(leaseStartedAt.getTime() - 5 * 60 * 1000);
  // db-access-guard: system-exempt -- reason: compare-and-set reclaims only the exact verified failed receipt or a stale recoverable subscription lease.
  const reclaimed = await db
    .update(webhookEvents)
    .set({
      receivedAt: leaseStartedAt,
      processedAt: null,
      processingResult: null,
      error: null,
    })
    .where(
      and(
        eq(webhookEvents.dedupeKey, params.dedupeKey),
        eq(webhookEvents.processingScopeKey, params.processingScopeKey),
        eq(webhookEvents.payloadHash, params.payloadHash),
        eq(webhookEvents.signatureValid, true),
        or(
          eq(webhookEvents.processingResult, 'retryable_error'),
          hasRecoverableLease(params)
            ? and(
                eq(webhookEvents.eventType, params.eventType ?? ''),
                isNull(webhookEvents.processingResult),
                lt(webhookEvents.receivedAt, staleBefore)
              )
            : undefined
        )
      )
    )
    .returning({ id: webhookEvents.id });

  return reclaimed[0] ?? null;
}

export async function findNonTerminalRecoverableLease(params: ReceiptEvidence) {
  if (!hasRecoverableLease(params)) return null;

  // db-access-guard: system-exempt -- reason: exact verified receipt evidence distinguishes an active lease from a terminal duplicate before tenant processing resumes.
  return db.query.webhookEvents.findFirst({
    where: (events, { and, eq, isNull, or }) =>
      and(
        eq(events.provider, 'paddle'),
        eq(events.processingScopeKey, params.processingScopeKey),
        eq(events.dedupeKey, params.dedupeKey),
        eq(events.eventType, params.eventType ?? ''),
        eq(events.payloadHash, params.payloadHash),
        eq(events.signatureValid, true),
        or(isNull(events.processingResult), eq(events.processingResult, 'retryable_error'))
      ),
    columns: { id: true },
  });
}
