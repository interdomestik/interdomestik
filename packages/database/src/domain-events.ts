import { CLAIM_STATUSES, type ClaimStatus } from './constants';
import { db } from './db';
import { domainEvents } from './schema/domain-events';

export type DomainEventTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AppendEventParams = {
  actor: {
    id: string;
    role: string;
  };
  aggregateVersion: number;
  correlationId: string;
  createdAt?: Date;
  entity: {
    id: string;
    type: string;
  };
  eventName: string;
  eventVersion: number;
  id?: string;
  payload?: Record<string, unknown>;
  tenantId: string;
};

export type AppendEventResult = {
  id: string;
};

type PayloadValidator = (payload: Record<string, unknown>) => Record<string, unknown>;

const CLAIM_STATUS_SET = new Set<string>(CLAIM_STATUSES);
const CLAIM_STATUS_CHANGED_KEYS = new Set(['fromStatus', 'toStatus']);

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`appendEvent requires ${field}`);
  }
}

function assertIntegerAtLeast(value: number, minimum: number, field: string): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`appendEvent requires ${field} >= ${minimum}`);
  }
}

function eventPayloadAllowlistKey(params: AppendEventParams): string {
  return `${params.eventName}@${params.eventVersion}`;
}

function assertClaimStatus(value: unknown, field: string): asserts value is ClaimStatus {
  if (typeof value !== 'string' || !CLAIM_STATUS_SET.has(value)) {
    throw new Error(`appendEvent requires payload.${field} to be a claim status`);
  }
}

function assertNoUnexpectedPayloadFields(
  payload: Record<string, unknown>,
  eventName: string
): void {
  for (const field of Object.keys(payload)) {
    if (!CLAIM_STATUS_CHANGED_KEYS.has(field)) {
      throw new Error(`appendEvent payload field ${field} is not allowlisted for ${eventName}`);
    }
  }
}

function assertClaimStatusChangedPayload(payload: Record<string, unknown>): void {
  assertNoUnexpectedPayloadFields(payload, 'claim.status_changed');
  for (const field of CLAIM_STATUS_CHANGED_KEYS) {
    if (!Object.hasOwn(payload, field)) {
      throw new Error(`appendEvent requires payload.${field}`);
    }
    assertClaimStatus(payload[field], field);
  }
}

function claimStatusChangedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  assertClaimStatusChangedPayload(payload);
  return { fromStatus: payload.fromStatus, toStatus: payload.toStatus };
}

const PAYLOAD_VALIDATORS: Record<string, PayloadValidator> = {
  'claim.status_changed@1': claimStatusChangedPayload,
};

function assertAllowlistedPayload(params: AppendEventParams): Record<string, unknown> {
  const payload = params.payload ?? {};
  const allowlistKey = eventPayloadAllowlistKey(params);
  const validator = PAYLOAD_VALIDATORS[allowlistKey];

  if (!validator) {
    throw new Error(`appendEvent payload allowlist missing for ${allowlistKey}`);
  }

  return validator(payload);
}

export async function appendEvent(
  tx: DomainEventTx,
  params: AppendEventParams
): Promise<AppendEventResult> {
  const eventId = params.id ?? crypto.randomUUID();

  assertNonEmpty(eventId, 'id');
  assertNonEmpty(params.tenantId, 'tenantId');
  assertNonEmpty(params.actor.id, 'actor.id');
  assertNonEmpty(params.actor.role, 'actor.role');
  assertNonEmpty(params.entity.type, 'entity.type');
  assertNonEmpty(params.entity.id, 'entity.id');
  assertNonEmpty(params.eventName, 'eventName');
  assertNonEmpty(params.correlationId, 'correlationId');
  assertIntegerAtLeast(params.eventVersion, 1, 'eventVersion');
  assertIntegerAtLeast(params.aggregateVersion, 0, 'aggregateVersion');
  const payload = assertAllowlistedPayload(params);

  const [row] = await tx
    .insert(domainEvents)
    .values({
      id: eventId,
      tenantId: params.tenantId,
      actorId: params.actor.id,
      actorRole: params.actor.role,
      entityType: params.entity.type,
      entityId: params.entity.id,
      eventName: params.eventName,
      eventVersion: params.eventVersion,
      aggregateVersion: params.aggregateVersion,
      correlationId: params.correlationId,
      payload,
      ...(params.createdAt ? { createdAt: params.createdAt } : {}),
    })
    .returning({ id: domainEvents.id });

  return { id: row?.id ?? eventId };
}
