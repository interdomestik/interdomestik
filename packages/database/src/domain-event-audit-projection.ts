import { CLAIM_STATUSES, type ClaimStatus } from './constants';
import {
  domainEventRelayDelivery,
  recordRelayedDomainEventDelivery,
  selectDomainEventRelayBatch,
} from './domain-event-relay';
import type {
  DomainEventRelayEvent,
  RelayDomainEventsParams,
  RelayDomainEventsResult,
} from './domain-event-relay-types';
import type { DomainEventTx } from './domain-events';
import { auditLog } from './schema/notes';

export const CLAIM_STATUS_AUDIT_PROJECTION_CONSUMER_NAME = 'audit_projection';

type AuditProjectionRelayTx = DomainEventTx & {
  execute<T>(query: unknown): Promise<T[]>;
};

type ClaimStatusChangedPayload = {
  fromStatus: ClaimStatus;
  toStatus: ClaimStatus;
};

export type ProjectClaimStatusChangedAuditResult = {
  auditLogId: string;
  status: 'projected' | 'already_projected';
};

const CLAIM_STATUS_SET = new Set<string>(CLAIM_STATUSES);

function assertNonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`audit projection requires ${field}`);
  return normalized;
}

function assertClaimStatus(value: unknown, field: string): asserts value is ClaimStatus {
  if (typeof value !== 'string' || !CLAIM_STATUS_SET.has(value)) {
    throw new Error(`audit projection requires payload.${field} to be a claim status`);
  }
}

function claimStatusAuditLogId(eventId: string): string {
  return `domain-event-audit:${assertNonBlank(eventId, 'event.id')}`;
}

function claimStatusChangedPayload(event: DomainEventRelayEvent): ClaimStatusChangedPayload {
  if (event.eventName !== 'claim.status_changed' || event.eventVersion !== 1) {
    throw new Error('audit projection only supports claim.status_changed@1');
  }
  if (event.entityType !== 'claim') {
    throw new Error('audit projection requires claim entity events');
  }
  assertClaimStatus(event.payload.fromStatus, 'fromStatus');
  assertClaimStatus(event.payload.toStatus, 'toStatus');
  return {
    fromStatus: event.payload.fromStatus,
    toStatus: event.payload.toStatus,
  };
}

export async function projectClaimStatusChangedAuditEvent(
  tx: DomainEventTx,
  event: DomainEventRelayEvent,
  delivery: { idempotencyKey: string }
): Promise<ProjectClaimStatusChangedAuditResult> {
  const payload = claimStatusChangedPayload(event);
  const auditLogId = claimStatusAuditLogId(event.id);
  const [row] = await tx
    .insert(auditLog)
    .values({
      id: auditLogId,
      tenantId: assertNonBlank(event.tenantId, 'tenantId'),
      actorId: assertNonBlank(event.actorId, 'actor.id'),
      actorRole: assertNonBlank(event.actorRole, 'actor.role'),
      action: event.eventName,
      entityType: event.entityType,
      entityId: assertNonBlank(event.entityId, 'entity.id'),
      metadata: {
        aggregateVersion: event.aggregateVersion,
        correlationId: event.correlationId,
        eventId: event.id,
        eventCreatedAt: event.createdAt.toISOString(),
        eventName: event.eventName,
        eventVersion: event.eventVersion,
        fromStatus: payload.fromStatus,
        idempotencyKey: delivery.idempotencyKey,
        projection: CLAIM_STATUS_AUDIT_PROJECTION_CONSUMER_NAME,
        toStatus: payload.toStatus,
      },
    })
    .onConflictDoNothing({ target: auditLog.id })
    .returning({ id: auditLog.id });

  return { auditLogId, status: row ? 'projected' : 'already_projected' };
}

/** Projects each undelivered claim status event into the audit log and records its delivery,
 * calling the projection directly with the transaction (no consumer object retains it). */
export async function relayClaimStatusAuditProjectionEvents(
  tx: AuditProjectionRelayTx,
  params: Omit<RelayDomainEventsParams, 'consumer'>
): Promise<RelayDomainEventsResult> {
  const batch = await selectDomainEventRelayBatch(tx, {
    ...params,
    consumerName: CLAIM_STATUS_AUDIT_PROJECTION_CONSUMER_NAME,
    eventName: 'claim.status_changed',
    eventVersion: 1,
  });
  return projectAuditEventsFrom(tx, batch, 0, batch.result);
}

type AuditRelayBatch = Awaited<ReturnType<typeof selectDomainEventRelayBatch>>;

/** Projects and records the batch's events one at a time, in order, on the same transaction. */
async function projectAuditEventsFrom(
  tx: AuditProjectionRelayTx,
  batch: AuditRelayBatch,
  index: number,
  result: RelayDomainEventsResult
): Promise<RelayDomainEventsResult> {
  const event = batch.events[index];
  if (!event) return result;
  await projectClaimStatusChangedAuditEvent(tx, event, domainEventRelayDelivery(batch, event));
  const recorded = await recordRelayedDomainEventDelivery(tx, batch, result, event);
  return projectAuditEventsFrom(tx, batch, index + 1, recorded);
}
