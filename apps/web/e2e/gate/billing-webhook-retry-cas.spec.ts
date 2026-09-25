import { db, eq, webhookEvents } from '@interdomestik/database';
import {
  insertWebhookEvent,
  markWebhookProcessed,
} from '@interdomestik/domain-membership-billing/paddle-webhooks';
import { expect, test, type TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';

function scenarioId(testInfo: TestInfo, prefix: string): string {
  const nonce = randomUUID().replace(/-/g, '').slice(0, 10);
  return `${prefix}_${testInfo.project.name.replace(/[^a-z0-9]+/gi, '_')}_${nonce}`;
}

test('B5 retry compare-and-set admits one concurrent claimant', async ({}, testInfo) => {
  const eventId = scenarioId(testInfo, 'a19_b5_retry_evt');
  const receiptId = scenarioId(testInfo, 'a19_b5_retry_receipt');
  const payloadHash = scenarioId(testInfo, 'a19_b5_retry_hash');
  const dedupeKey = `paddle:entity:ks:event:${eventId}`;
  const payload = { event_id: eventId, event_type: 'subscription.created', data: {} };

  await db.insert(webhookEvents).values({
    id: receiptId,
    tenantId: 'tenant_ks',
    provider: 'paddle',
    processingScopeKey: 'entity:ks',
    dedupeKey,
    eventType: 'subscription.created',
    eventId,
    signatureValid: true,
    payloadHash,
    payload,
    processedAt: new Date(),
    processingResult: 'retryable_error',
    error: 'verified dependency was not ready',
  });

  const replayParams = {
    headers: new Headers(),
    processingScopeKey: 'entity:ks',
    dedupeKey,
    eventType: 'subscription.created',
    eventId,
    signatureValid: true,
    signatureBypassed: false,
    eventTimestamp: null,
    payloadHash,
    parsedPayload: payload,
    tenantId: 'tenant_ks',
  };
  const concurrentClaims = await Promise.all([
    insertWebhookEvent(replayParams),
    insertWebhookEvent(replayParams),
  ]);

  expect(concurrentClaims).toEqual(
    expect.arrayContaining([
      { inserted: true, webhookEventRowId: receiptId },
      { inserted: false, webhookEventRowId: null },
    ])
  );

  await markWebhookProcessed({
    headers: new Headers(),
    webhookEventRowId: receiptId,
    eventType: 'subscription.created',
    eventId,
    tenantId: 'tenant_ks',
  });
  await expect(insertWebhookEvent(replayParams)).resolves.toEqual({
    inserted: false,
    webhookEventRowId: null,
  });

  const receiptRows = await db
    .select({ id: webhookEvents.id, processingResult: webhookEvents.processingResult })
    .from(webhookEvents)
    .where(eq(webhookEvents.eventId, eventId));
  expect(receiptRows).toEqual([{ id: receiptId, processingResult: 'ok' }]);
});
