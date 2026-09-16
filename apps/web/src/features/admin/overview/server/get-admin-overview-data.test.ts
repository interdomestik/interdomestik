import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  withTenantContextMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@interdomestik/database', () => ({
  withTenantContext: hoisted.withTenantContextMock,
}));

import { getAdminOverviewData } from './get-admin-overview-data';

describe('getAdminOverviewData role guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['branch_manager', 'staff', 'agent', 'member'] as const)(
    'rejects %s before opening a tenant aggregate context',
    async role => {
      await expect(getAdminOverviewData({ role, tenantId: 'tenant-a' })).rejects.toThrow(
        'Forbidden: Tenant Overview'
      );
      expect(hoisted.withTenantContextMock).not.toHaveBeenCalled();
    }
  );
});
