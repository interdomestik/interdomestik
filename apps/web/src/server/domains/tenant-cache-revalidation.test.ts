import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetTenantCacheRelayMocks,
  tenantCacheRelayMocks,
} from './tenant-cache-revalidation.test-mocks';
import {
  relayTenantCacheRevalidationEvents,
  TENANT_CACHE_REVALIDATION_CONSUMER,
} from './tenant-cache-revalidation';
import {
  relayDelivery,
  relayEvent,
  relayParams,
  relaySelection,
  relayTx,
} from './tenant-cache-revalidation.test-support';

const databaseMocks = tenantCacheRelayMocks();

describe('relayTenantCacheRevalidationEvents', () => {
  beforeEach(() => resetTenantCacheRelayMocks());

  it('revalidates tenant-qualified case and member tags from outbox events', async () => {
    const revalidate = vi.fn();
    databaseMocks.selectDomainEventsForRelay.mockResolvedValue([relayEvent()]);

    const result = await relayTenantCacheRevalidationEvents(relayTx, relayParams(revalidate));

    expect(databaseMocks.selectDomainEventsForRelay).toHaveBeenCalledWith(relayTx, {
      ...relaySelection(TENANT_CACHE_REVALIDATION_CONSUMER),
    });
    expect(revalidate).toHaveBeenCalledWith(
      'case:access_tenant_id:tenant-a:shared-claim-id',
      'max'
    );
    expect(revalidate).toHaveBeenCalledWith('member:access_tenant_id:tenant-a:member-1', 'max');
    expect(databaseMocks.recordDomainEventDelivery).toHaveBeenCalledWith(relayTx, {
      ...relayDelivery(TENANT_CACHE_REVALIDATION_CONSUMER, 'event-1'),
    });
    expect(result).toEqual({ delivered: 1, failed: 0, selected: 1, tagsRevalidated: 2 });
  });

  it('records non-case events without revalidating tags', async () => {
    const revalidate = vi.fn();
    databaseMocks.selectDomainEventsForRelay.mockResolvedValue([
      relayEvent({ entityType: 'subscription', eventName: 'subscription.updated' }),
    ]);

    const result = await relayTenantCacheRevalidationEvents(relayTx, relayParams(revalidate));

    expect(revalidate).not.toHaveBeenCalled();
    expect(databaseMocks.recordDomainEventDelivery).toHaveBeenCalledWith(relayTx, {
      ...relayDelivery(TENANT_CACHE_REVALIDATION_CONSUMER, 'event-1'),
    });
    expect(result).toEqual({ delivered: 1, failed: 0, selected: 1, tagsRevalidated: 0 });
  });

  it('keeps overlapping ids isolated by event tenant', async () => {
    const revalidate = vi.fn();
    databaseMocks.selectDomainEventsForRelay
      .mockResolvedValueOnce([relayEvent({ id: 'event-a', tenantId: 'tenant-a' })])
      .mockResolvedValueOnce([relayEvent({ id: 'event-b', tenantId: 'tenant-b' })]);

    await relayTenantCacheRevalidationEvents(relayTx, relayParams(revalidate));
    await relayTenantCacheRevalidationEvents(
      relayTx,
      relayParams(revalidate, { tenantId: 'tenant-b' })
    );

    expect(databaseMocks.selectDomainEventsForRelay).toHaveBeenNthCalledWith(1, relayTx, {
      ...relaySelection(TENANT_CACHE_REVALIDATION_CONSUMER),
    });
    expect(databaseMocks.selectDomainEventsForRelay).toHaveBeenNthCalledWith(2, relayTx, {
      ...relaySelection(TENANT_CACHE_REVALIDATION_CONSUMER, 'tenant-b'),
    });
    expect(revalidate.mock.calls).toEqual([
      ['case:access_tenant_id:tenant-a:shared-claim-id', 'max'],
      ['member:access_tenant_id:tenant-a:member-1', 'max'],
      ['case:access_tenant_id:tenant-b:shared-claim-id', 'max'],
      ['member:access_tenant_id:tenant-b:member-1', 'max'],
    ]);
  });
});
