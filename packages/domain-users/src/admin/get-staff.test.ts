import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  withTenant: vi.fn(() => ({ scoped: true })),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      user: { findMany: mocks.findMany },
    },
  },
  user: { tenantId: 'user.tenant_id', role: 'user.role' },
  inArray: vi.fn((column, values) => ({ column, values })),
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  scopeFilter: vi.fn(() => ({
    tenantId: 'tenant-1',
    isFullTenantScope: true,
  })),
}));

vi.mock('./access', () => ({
  requireTenantAdminSession: vi.fn(async (session: unknown) => session),
}));

import { getStaffCore } from './get-staff';

describe('getStaffCore', () => {
  it('uses withTenant to scope staff list', async () => {
    mocks.findMany.mockResolvedValue([]);

    const result = await getStaffCore({ session: { user: { id: 'admin-1' } } as never });

    expect(result).toEqual([]);
    expect(mocks.withTenant).toHaveBeenCalledWith('tenant-1', 'user.tenant_id', expect.any(Object));
  });
});
