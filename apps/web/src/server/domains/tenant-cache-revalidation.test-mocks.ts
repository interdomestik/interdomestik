import { vi } from 'vitest';

const databaseMocks = vi.hoisted(() => ({
  recordDomainEventDelivery: vi.fn(),
  selectDomainEventsForRelay: vi.fn(),
}));

vi.mock('@interdomestik/database', () => databaseMocks);

export function tenantCacheRelayMocks() {
  return databaseMocks;
}

export function resetTenantCacheRelayMocks(): void {
  vi.resetAllMocks();
  databaseMocks.recordDomainEventDelivery.mockResolvedValue({ status: 'delivered' });
}
