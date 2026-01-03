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
  user: { tenantId: 'user.tenant_id', role: 'user.role', branchId: 'user.branch_id' },
  eq: vi.fn((left, right) => ({ left, right })),
  and: vi.fn((...args) => ({ and: args })),
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  scopeFilter: vi.fn(() => ({
    tenantId: 'tenant-1',
    branchId: null,
    isFullTenantScope: true,
  })),
}));

vi.mock('./access', () => ({
  requireTenantAdminOrBranchManagerSession: vi.fn(async (session: unknown) => session),
}));

import { getAgentsCore } from './get-agents';

describe('getAgentsCore', () => {
  it('uses withTenant to scope agent list', async () => {
    mocks.findMany.mockResolvedValue([]);

    const result = await getAgentsCore({ session: { user: { id: 'admin-1' } } as never });

    expect(result).toEqual([]);
    expect(mocks.withTenant).toHaveBeenCalledWith('tenant-1', 'user.tenant_id', expect.any(Object));
  });
});
