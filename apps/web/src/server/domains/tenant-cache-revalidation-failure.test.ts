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
  relayTx,
} from './tenant-cache-revalidation.test-support';

const databaseMocks = tenantCacheRelayMocks();

describe('relayTenantCacheRevalidationEvents failures', () => {
  beforeEach(() => resetTenantCacheRelayMocks());

  it('continues the batch when one event fails before delivery recording', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    databaseMocks.selectDomainEventsForRelay.mockResolvedValue([
      relayEvent({ id: 'event-fail' }),
      relayEvent({ id: 'event-ok', entityId: 'claim-ok' }),
    ]);

    const result = await relayTenantCacheRevalidationEvents(
      relayTx,
      relayParams(vi.fn(), {
        resolveMemberId: async row =>
          row.id === 'event-fail' ? Promise.reject(new Error('resolver')) : 'member-1',
      })
    );

    expect(databaseMocks.recordDomainEventDelivery).toHaveBeenCalledTimes(1);
    expect(databaseMocks.recordDomainEventDelivery).toHaveBeenCalledWith(relayTx, {
      ...relayDelivery(TENANT_CACHE_REVALIDATION_CONSUMER, 'event-ok'),
    });
    expect(errorSpy).toHaveBeenCalledWith('tenant cache revalidation event failed', {
      entityType: 'case',
      eventId: 'event-fail',
      eventName: 'case.lifecycle_changed',
    });
    expect(result).toEqual({ delivered: 1, failed: 1, selected: 2, tagsRevalidated: 2 });
    errorSpy.mockRestore();
  });
});
