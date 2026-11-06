import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  where: vi.fn(),
  withTenantAuthority: vi.fn(),
}));

vi.mock('@/features/admin/branches/server/branch-cash-metrics', () => ({
  getBranchCashPendingByAgent: vi.fn(),
}));
vi.mock('@interdomestik/database/tenant-authority', () => ({
  readTenantAuthority: () => ({ tenantId: 'tenant_ks' }),
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: mocks.withTenantAuthority,
}));

import { getStaffLoad } from './branch-dashboard-v2-metrics';

const dialect = new PgDialect();

describe('getStaffLoad', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const tx = {
      query: { user: { findMany: async () => [{ id: 'staff-1', name: 'Staff', branchId: null }] } },
      select: () => ({
        from: () => ({
          where: (predicate: SQL) => {
            mocks.where(predicate);
            return Promise.resolve([{ count: 3 }]);
          },
        }),
      }),
    };
    mocks.withTenantAuthority.mockImplementation((_authority, run) => run(tx));
  });

  it('counts airline-stage claims in the staff branch workload', async () => {
    const result = await getStaffLoad('branch-1', {} as never);

    expect(result).toEqual([{ id: 'staff-1', name: 'Staff', workload: 3, severity: 'healthy' }]);
    const { params } = dialect.sqlToQuery(mocks.where.mock.calls[0]![0]);
    expect(params).toEqual(expect.arrayContaining(['submitted', 'submitted_to_airline', 'court']));
    expect(params).not.toContain('draft');
  });
});
