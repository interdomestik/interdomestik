import type { DomainEventRelayEvent } from '@interdomestik/database';
import type { relayTenantCacheRevalidationEvents } from './tenant-cache-revalidation';

type RelayTx = Parameters<typeof relayTenantCacheRevalidationEvents>[0];
type RevalidateTenantCacheTag = (tag: string, profile: 'max') => void;
type ResolveMemberId = (event: DomainEventRelayEvent) => Promise<string | null>;

export const relayTx = Symbol('tenant-cache-relay-test-tx') as unknown as RelayTx;

export function relayEvent(overrides: Partial<DomainEventRelayEvent> = {}): DomainEventRelayEvent {
  return {
    actorId: 'staff-1',
    actorRole: 'staff',
    aggregateVersion: 1,
    correlationId: 'corr-1',
    createdAt: new Date('2026-06-20T12:00:00.000Z'),
    entityId: 'shared-claim-id',
    entityType: 'case',
    eventName: 'case.lifecycle_changed',
    eventVersion: 1,
    id: 'event-1',
    payload: {},
    tenantId: 'tenant-a',
    ...overrides,
  };
}

export function relayParams(
  revalidate: RevalidateTenantCacheTag,
  overrides: { resolveMemberId?: ResolveMemberId; tenantId?: string } = {}
) {
  return {
    deps: {
      revalidate,
      resolveMemberId: overrides.resolveMemberId ?? (async () => 'member-1'),
    },
    limit: 10,
    tenantId: overrides.tenantId ?? 'tenant-a',
  };
}

export function relaySelection(consumerName: string, tenantId = 'tenant-a') {
  return { consumerName, limit: 10, mode: undefined, tenantId };
}

export function relayDelivery(consumerName: string, eventId: string, tenantId = 'tenant-a') {
  return { consumerName, eventId, tenantId };
}
