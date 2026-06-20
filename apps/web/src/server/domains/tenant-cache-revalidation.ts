import 'server-only';

import {
  recordDomainEventDelivery,
  selectDomainEventsForRelay,
  type DomainEventRelayEvent,
  type DomainEventTx,
  type RelayMode,
} from '@interdomestik/database';
import { revalidateTag } from 'next/cache';

import { tenantCacheTag } from './tenant-cache';

export const TENANT_CACHE_REVALIDATION_CONSUMER = 'tenant_cache_revalidation';

type RelayTx = DomainEventTx & { execute<T>(query: unknown): Promise<T[]> };
type RevalidateTenantCacheTag = (tag: string, profile: 'max') => void;

type RevalidationDeps = {
  revalidate?: RevalidateTenantCacheTag;
  resolveMemberId(event: DomainEventRelayEvent): Promise<string | null>;
};

function isCaseCacheEvent(event: DomainEventRelayEvent): boolean {
  return (
    event.entityType === 'case' ||
    event.entityType === 'claim' ||
    event.eventName.startsWith('case.') ||
    event.eventName.startsWith('claim.')
  );
}

async function revalidateEventTags(
  event: DomainEventRelayEvent,
  deps: RevalidationDeps
): Promise<number> {
  if (!isCaseCacheEvent(event)) return 0;

  const revalidate = deps.revalidate ?? revalidateTag;
  revalidate(tenantCacheTag('case', event.tenantId, event.entityId), 'max');

  const memberId = await deps.resolveMemberId(event);
  if (memberId) {
    revalidate(tenantCacheTag('member', event.tenantId, memberId), 'max');
    return 2;
  }

  return 1;
}

export async function relayTenantCacheRevalidationEvents(
  tx: RelayTx,
  params: { deps: RevalidationDeps; limit: number; mode?: RelayMode; tenantId: string }
): Promise<{ delivered: number; failed: number; selected: number; tagsRevalidated: number }> {
  // Specialized relay mirrors billing relays: revalidate tags before recording delivery.
  const events = await selectDomainEventsForRelay(tx, {
    consumerName: TENANT_CACHE_REVALIDATION_CONSUMER,
    limit: params.limit,
    mode: params.mode,
    tenantId: params.tenantId,
  });
  let delivered = 0;
  let failed = 0;
  let tagsRevalidated = 0;

  for (const event of events) {
    try {
      tagsRevalidated += await revalidateEventTags(event, params.deps);
      const delivery = await recordDomainEventDelivery(tx, {
        consumerName: TENANT_CACHE_REVALIDATION_CONSUMER,
        eventId: event.id,
        tenantId: event.tenantId,
      });
      if (delivery.status === 'delivered') delivered += 1;
    } catch {
      failed += 1;
      console.error('tenant cache revalidation event failed', {
        entityType: event.entityType,
        eventId: event.id,
        eventName: event.eventName,
      });
    }
  }

  return { delivered, failed, selected: events.length, tagsRevalidated };
}
