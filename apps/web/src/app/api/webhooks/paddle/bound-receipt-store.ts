import { lt } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import { and, dbAdmin, eq, isNull, or, sql, webhookEvents } from '@interdomestik/database';
import type {
  PaddleReceiptInsert,
  PaddleWebhookReceiptStore,
} from '@interdomestik/domain-membership-billing/paddle-webhooks';

/** Internal constructor: caller binds verified raw bytes and canonical identity first. */
export function bindPaddleReceiptStore(
  evidence: Omit<PaddleReceiptInsert, 'id'>
): PaddleWebhookReceiptStore {
  const expected = structuredClone(evidence);
  const held = new Map<string, string>();
  const predicate = () =>
    and(
      eq(webhookEvents.provider, 'paddle'),
      eq(webhookEvents.processingScopeKey, expected.processingScopeKey),
      eq(webhookEvents.dedupeKey, expected.dedupeKey),
      eq(webhookEvents.payloadHash, expected.payloadHash),
      sql`isfinite(${webhookEvents.receivedAt})`
    );
  const recoverable =
    expected.eventType === 'subscription.created' ||
    (expected.eventType === 'subscription.past_due' &&
      expected.processingScopeKey.startsWith('entity:'));
  function assertEvidence(input: {
    processingScopeKey: string;
    dedupeKey: string;
    payloadHash: string;
    eventType?: string;
  }) {
    if (
      input.processingScopeKey !== expected.processingScopeKey ||
      input.dedupeKey !== expected.dedupeKey ||
      input.payloadHash !== expected.payloadHash ||
      (input.eventType ?? null) !== expected.eventType
    ) {
      throw new Error('Paddle receipt evidence mismatch');
    }
  }
  const leaseProjection = {
    id: webhookEvents.id,
    lease: sql<string>`to_char(${webhookEvents.receivedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  };
  return {
    async insert(input) {
      const { id, ...record } = input;
      if (!id || !isDeepStrictEqual(record, expected))
        throw new Error('Paddle receipt insert mismatch');
      const rows = await dbAdmin
        .insert(webhookEvents)
        .values({ id, ...expected })
        .onConflictDoNothing()
        .returning(leaseProjection);
      if (expected.signatureValid) for (const row of rows) held.set(row.id, row.lease);
      return rows.map(({ id: rowId }) => ({ id: rowId }));
    },
    async reclaim(input) {
      assertEvidence(input);
      if (!expected.signatureValid)
        throw new Error('Invalid signature has no receipt lease authority');
      const rows = await dbAdmin
        .update(webhookEvents)
        .set({
          receivedAt: sql`greatest(clock_timestamp(), ${webhookEvents.receivedAt} + interval '1 microsecond')`,
          processedAt: null,
          processingResult: null,
          error: null,
        })
        .where(
          and(
            predicate(),
            eq(webhookEvents.signatureValid, true),
            or(
              eq(webhookEvents.processingResult, 'retryable_error'),
              recoverable
                ? and(
                    eq(webhookEvents.eventType, expected.eventType!),
                    isNull(webhookEvents.processingResult),
                    lt(webhookEvents.receivedAt, new Date(Date.now() - 5 * 60 * 1000))
                  )
                : undefined
            )
          )
        )
        .returning(leaseProjection);
      const row = rows[0];
      if (!row) return null;
      held.set(row.id, row.lease);
      return { id: row.id };
    },
    async findRecoverableLease(input) {
      assertEvidence(input);
      if (!expected.signatureValid || !recoverable) return null;
      return (
        (await dbAdmin.query.webhookEvents.findFirst({
          where: and(
            predicate(),
            eq(webhookEvents.eventType, expected.eventType!),
            eq(webhookEvents.signatureValid, true),
            or(
              isNull(webhookEvents.processingResult),
              eq(webhookEvents.processingResult, 'retryable_error')
            )
          ),
          columns: { id: true },
        })) ?? null
      );
    },
    async mark(input) {
      const lease = held.get(input.id);
      if (!expected.signatureValid || !lease) throw new Error('Paddle receipt lease is not held');
      const rows = await dbAdmin
        .update(webhookEvents)
        .set({
          processedAt: input.processedAt,
          processingResult: input.processingResult,
          error: input.error,
        })
        .where(
          and(
            predicate(),
            eq(webhookEvents.id, input.id),
            eq(webhookEvents.signatureValid, true),
            isNull(webhookEvents.processingResult),
            sql`${webhookEvents.receivedAt} = ${lease}::timestamptz`
          )
        )
        .returning({ id: webhookEvents.id });
      if (rows.length !== 1) throw new Error('Paddle receipt lease lost');
      held.delete(input.id);
    },
  };
}
