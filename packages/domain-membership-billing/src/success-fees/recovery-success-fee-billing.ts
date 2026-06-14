import {
  and,
  domainEventDeliveries,
  domainEventDeliveryIdempotencyKey,
  domainEvents,
  eq,
  recordDomainEventDelivery,
  selectDomainEventsForRelay,
  sql,
  type DomainEventRelayEvent,
  type DomainEventTx,
  type RelayMode,
} from '@interdomestik/database';

import { getPaddle } from '../paddle-server';
import {
  createPaddleSuccessFeeTransaction,
  type PaddleSuccessFeeBillingResult,
  type RecoverySuccessFeeBillingSnapshot,
} from './paddle-success-fee-charge';
import {
  assertPayloadMatchesSnapshot,
  requireSuccessFeePayload,
  resolveSuccessFeeBillingSnapshot,
} from './recovery-success-fee-snapshot';
import { RECOVERY_SUCCESS_FEE_BILLING_CONSUMER } from './success-fee-consumer';

export { RECOVERY_SUCCESS_FEE_BILLING_CONSUMER };

type RelayTx = DomainEventTx & { execute<T>(query: unknown): Promise<T[]> };
type BillingDeps = {
  billSuccessFee?: (params: {
    event: DomainEventRelayEvent;
    idempotencyKey: string;
    snapshot: RecoverySuccessFeeBillingSnapshot;
  }) => Promise<PaddleSuccessFeeBillingResult>;
};

async function hasDelivery(tx: DomainEventTx, eventId: string) {
  const [row] = await tx
    .select({ id: domainEventDeliveries.id })
    .from(domainEventDeliveries)
    .where(
      and(
        eq(domainEventDeliveries.eventId, eventId),
        eq(domainEventDeliveries.consumerName, RECOVERY_SUCCESS_FEE_BILLING_CONSUMER)
      )
    )
    .limit(1);
  return Boolean(row);
}

async function hasNewerCollectedEvent(tx: DomainEventTx, event: DomainEventRelayEvent) {
  const [row] = await tx
    .select({ id: domainEvents.id })
    .from(domainEvents)
    .where(
      and(
        eq(domainEvents.tenantId, event.tenantId),
        eq(domainEvents.entityType, event.entityType),
        eq(domainEvents.entityId, event.entityId),
        eq(domainEvents.eventName, event.eventName),
        eq(domainEvents.eventVersion, event.eventVersion),
        sql`${domainEvents.aggregateVersion} > ${event.aggregateVersion}`
      )
    )
    .limit(1);
  return Boolean(row);
}

async function deliverSuccessFeeBillingEvent(
  tx: DomainEventTx,
  event: DomainEventRelayEvent,
  idempotencyKey: string,
  deps: BillingDeps
) {
  const payload = requireSuccessFeePayload(event);
  const snapshot = await resolveSuccessFeeBillingSnapshot(tx, event);
  assertPayloadMatchesSnapshot(payload, snapshot);
  if (deps.billSuccessFee) return deps.billSuccessFee({ event, idempotencyKey, snapshot });
  return createPaddleSuccessFeeTransaction({
    idempotencyKey,
    paddle: getPaddle({ tenantId: event.tenantId }) as never,
    snapshot,
  });
}

export async function relayRecoverySuccessFeeBillingEvents(
  tx: RelayTx,
  params: { deps?: BillingDeps; limit: number; mode?: RelayMode; tenantId: string }
) {
  const events = await selectDomainEventsForRelay(tx, {
    consumerName: RECOVERY_SUCCESS_FEE_BILLING_CONSUMER,
    eventName: 'recovery.success_fee_collected',
    eventVersion: 1,
    limit: params.limit,
    mode: params.mode,
    tenantId: params.tenantId,
  });
  let delivered = 0;
  let skippedAlreadyDelivered = 0;
  let skippedStale = 0;
  const billingResults: PaddleSuccessFeeBillingResult[] = [];

  for (const event of events) {
    if (params.mode === 'replay' && (await hasDelivery(tx, event.id))) {
      skippedAlreadyDelivered += 1;
      continue;
    }
    if (await hasNewerCollectedEvent(tx, event)) {
      const delivery = await recordDomainEventDelivery(tx, {
        consumerName: RECOVERY_SUCCESS_FEE_BILLING_CONSUMER,
        eventId: event.id,
        tenantId: event.tenantId,
      });
      if (delivery.status === 'already_delivered') skippedAlreadyDelivered += 1;
      else skippedStale += 1;
      continue;
    }
    const idempotencyKey = domainEventDeliveryIdempotencyKey(
      event.id,
      RECOVERY_SUCCESS_FEE_BILLING_CONSUMER
    );
    billingResults.push(
      await deliverSuccessFeeBillingEvent(tx, event, idempotencyKey, params.deps ?? {})
    );
    const delivery = await recordDomainEventDelivery(tx, {
      consumerName: RECOVERY_SUCCESS_FEE_BILLING_CONSUMER,
      eventId: event.id,
      tenantId: event.tenantId,
    });
    if (delivery.status === 'already_delivered') skippedAlreadyDelivered += 1;
    else delivered += 1;
  }

  return {
    billingResults,
    delivered,
    selected: events.length,
    skippedAlreadyDelivered,
    skippedStale,
  };
}
