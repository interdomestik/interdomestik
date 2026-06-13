import { CLAIM_STATUSES, type ClaimStatus } from './constants';
import { db } from './db';
import { domainEvents } from './schema/domain-events';

export type DomainEventTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AppendEventParams = {
  actor: { id: string; role: string };
  aggregateVersion: number;
  correlationId: string;
  createdAt?: Date;
  entity: { id: string; type: string };
  eventName: string;
  eventVersion: number;
  id?: string;
  payload?: Record<string, unknown>;
  tenantId: string;
};
export type AppendEventResult = { id: string };

const CASE_CREATED_KEYS = new Set(['hasDocuments', 'initialStatus']);
const CLAIM_STATUS_CHANGED_KEYS = new Set(['fromStatus', 'toStatus']);
const CLAIM_STATUS_SET = new Set<string>(CLAIM_STATUSES);
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
function assertClaimStatus(value: unknown, field: string): asserts value is ClaimStatus {
  if (typeof value !== 'string' || !CLAIM_STATUS_SET.has(value)) {
    throw new Error(`appendEvent requires payload.${field} to be a claim status`);
  }
}
function assertNoUnexpectedPayloadFields(
  payload: Record<string, unknown>,
  eventName: string,
  allowedKeys: Set<string>
): void {
  for (const field of Object.keys(payload)) {
    if (!allowedKeys.has(field)) {
      throw new Error(`appendEvent payload field ${field} is not allowlisted for ${eventName}`);
    }
  }
}
function assertRequiredPayloadField(payload: Record<string, unknown>, field: string): unknown {
  if (!Object.hasOwn(payload, field)) {
    throw new Error(`appendEvent requires payload.${field}`);
  }
  return payload[field];
}
function assertBooleanPayloadField(payload: Record<string, unknown>, field: string): boolean {
  const value = assertRequiredPayloadField(payload, field);
  if (typeof value !== 'boolean') {
    throw new TypeError(`appendEvent requires payload.${field} to be a boolean`);
  }
  return value;
}
function claimStatusChangedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  assertNoUnexpectedPayloadFields(payload, 'claim.status_changed', CLAIM_STATUS_CHANGED_KEYS);
  for (const field of CLAIM_STATUS_CHANGED_KEYS) {
    assertRequiredPayloadField(payload, field);
    assertClaimStatus(payload[field], field);
  }
  return { fromStatus: payload.fromStatus, toStatus: payload.toStatus };
}
function caseCreatedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  assertNoUnexpectedPayloadFields(payload, 'case.created', CASE_CREATED_KEYS);
  const initialStatus = assertRequiredPayloadField(payload, 'initialStatus');
  assertClaimStatus(initialStatus, 'initialStatus');
  return {
    hasDocuments: assertBooleanPayloadField(payload, 'hasDocuments'),
    initialStatus,
  };
}
const PAYLOAD_VALIDATORS: Record<
  string,
  (payload: Record<string, unknown>) => Record<string, unknown>
> = {
  'case.created@1': caseCreatedPayload,
  'claim.status_changed@1': claimStatusChangedPayload,
};
function assertAllowlistedPayload(params: AppendEventParams): Record<string, unknown> {
  const payload = params.payload ?? {};
  const allowlistKey = `${params.eventName}@${params.eventVersion}`;
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
