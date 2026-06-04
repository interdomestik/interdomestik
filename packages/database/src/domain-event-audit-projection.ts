import { CLAIM_STATUSES, type ClaimStatus } from './constants';
import { relayDomainEvents } from './domain-event-relay';
import type {
  DomainEventRelayConsumer,
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

export function claimStatusAuditProjectionConsumer(tx: DomainEventTx): DomainEventRelayConsumer {
  return {
    name: CLAIM_STATUS_AUDIT_PROJECTION_CONSUMER_NAME,
    deliver: async (event, delivery) => {
      await projectClaimStatusChangedAuditEvent(tx, event, delivery);
    },
  };
}

export async function relayClaimStatusAuditProjectionEvents(
  tx: AuditProjectionRelayTx,
  params: Omit<RelayDomainEventsParams, 'consumer'>
): Promise<RelayDomainEventsResult> {
  return relayDomainEvents(tx, {
    ...params,
    consumer: claimStatusAuditProjectionConsumer(tx),
    eventName: 'claim.status_changed',
    eventVersion: 1,
  });
}
