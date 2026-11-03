import type { Mock } from 'vitest';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';
import type { ClaimsSession } from '../claims/types';

const mocks: {
  selectChain: { from: Mock; where: Mock; limit: Mock };
  updateChain: { set: Mock };
  updateSetChain: { where: Mock };
  updateWhereChain: { returning: Mock };
  select: Mock;
  update: Mock;
  userFindFirst: Mock;
  withTenant: Mock;
  eq: Mock;
  and: Mock;
  or: Mock;
  isNull: Mock;
  ensureTenantId: Mock;
  logAuditEvent: Mock;
  claims: {
    id: string;
    tenantId: string;
    branchId: string;
    staffId: string;
    assignedAt: string;
    assignedById: string;
    updatedAt: string;
  };
  user: { branchId: string; id: string; role: string; tenantId: string };
} = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };

  const updateChain = {
    set: vi.fn(),
  };

  const updateSetChain = {
    where: vi.fn(),
  };

  const updateWhereChain = {
    returning: vi.fn(),
  };

  return {
    selectChain,
    updateChain,
    updateSetChain,
    updateWhereChain,
    select: vi.fn(),
    update: vi.fn(),
    userFindFirst: vi.fn(),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
    eq: vi.fn((left, right) => ({ left, right, op: 'eq' })),
    and: vi.fn((...conditions) => ({ op: 'and', conditions })),
    or: vi.fn((...conditions) => ({ op: 'or', conditions })),
    isNull: vi.fn(column => ({ column, op: 'isNull' })),
    ensureTenantId: vi.fn(() => 'tenant-1'),
    logAuditEvent: vi.fn(),
    claims: {
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      branchId: 'claims.branch_id',
      staffId: 'claims.staff_id',
      assignedAt: 'claims.assigned_at',
      assignedById: 'claims.assigned_by_id',
      updatedAt: 'claims.updated_at',
    },
    user: {
      branchId: 'user.branch_id',
      id: 'user.id',
      role: 'user.role',
      tenantId: 'user.tenant_id',
    },
  };
});
vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      user: {
        findFirst: mocks.userFindFirst,
      },
    },
    select: mocks.select,
    update: mocks.update,
  },
  withTenantContext: vi.fn(
    async (_ctx: unknown, cb: (tx: any) => unknown) =>
      await cb({
        query: { user: { findFirst: mocks.userFindFirst } },
        select: mocks.select,
        update: mocks.update,
      })
  ),
  claims: mocks.claims,
  eq: mocks.eq,
  and: mocks.and,
  user: mocks.user,
}));
vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));
vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));
vi.mock('drizzle-orm', () => ({
  isNull: mocks.isNull,
  or: mocks.or,
}));
function createSession(options: {
  userId: string;
  tenantId?: string;
  branchId?: string | null;
  role?: string;
}): ClaimsSession {
  return {
    user: {
      id: options.userId,
      role: options.role ?? 'staff',
      tenantId: options.tenantId ?? 'tenant-1',
      ...(options.branchId !== undefined ? { branchId: options.branchId } : {}),
    },
  } as unknown as ClaimsSession;
}
const authority: TenantAuthority = mintTestTenantAuthority('tenant-1');

export { mocks, createSession, authority };
