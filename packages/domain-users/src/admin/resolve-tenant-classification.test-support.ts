import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi, type Mock } from 'vitest';

// Matches Vitest's own Procedure so typed mocks stay callable and assignable like inferred ones.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFunction = Mock<(...args: any[]) => any>;

export type MockTenantSession = {
  user: { accessTenantId?: string | null; tenantId?: string | null };
};

type MocksMocks = {
  returning: MockFunction;
  where: MockFunction;
  set: MockFunction;
  update: MockFunction;
  findFirst: MockFunction;
  tx: {
    update: MockFunction;
    query: {
      user: {
        findFirst: MockFunction;
      };
    };
  };
  withTenantContext: MockFunction;
  delegateSuperAdminTenant: MockFunction;
  user: {
    id: string;
    tenantId: string;
    tenantClassificationPending: string;
  };
  eq: MockFunction;
  withTenant: MockFunction;
  ensureAccessTenantId: MockFunction;
  ensureTenantId: MockFunction;
};

const mocks: MocksMocks = vi.hoisted(() => {
  const accessTenantOf = ({ user }: MockTenantSession) =>
    user.accessTenantId?.trim() || user.tenantId?.trim();
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const findFirst = vi.fn();
  const tx = { update, query: { user: { findFirst } } };

  return {
    returning,
    where,
    set,
    update,
    findFirst,
    tx,
    withTenantContext: vi.fn(),
    delegateSuperAdminTenant: vi.fn(),
    user: {
      id: 'user.id',
      tenantId: 'user.tenantId',
      tenantClassificationPending: 'user.tenantClassificationPending',
    },
    eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
    withTenant: vi.fn((tenantId: string, tenantColumn: unknown, filter: unknown) => ({
      op: 'withTenant',
      tenantId,
      tenantColumn,
      filter,
    })),
    ensureAccessTenantId: vi.fn(accessTenantOf),
    // The session's own tenant (not the access tenant), as the real helper reads it.
    ensureTenantId: vi.fn(({ user }: MockTenantSession) => user.tenantId?.trim()),
  };
});

vi.mock('@interdomestik/database', () => ({
  user: mocks.user,
  eq: mocks.eq,
  withTenantContext: mocks.withTenantContext,
  delegateSuperAdminTenant: mocks.delegateSuperAdminTenant,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureAccessTenantId: mocks.ensureAccessTenantId,
  ensureTenantId: mocks.ensureTenantId,
}));

vi.mock('./access', () => ({
  requireTenantAdminSession: vi.fn(async (session: unknown) => session),
}));

export const adminSession = {
  user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant_ks' },
} as never;

export const superAdminSession = {
  user: { id: 'super-1', role: 'super_admin', tenantId: 'tenant_ks' },
} as never;

// Session-producer authorities for the sessions above, and a super-admin delegation target.
export const adminAuthority: TenantAuthority = mintTestTenantAuthority('tenant_ks', {
  userId: 'admin-1',
  role: 'tenant_admin',
});
export const superAuthority: TenantAuthority = mintTestTenantAuthority('tenant_ks', {
  userId: 'super-1',
  role: 'super_admin',
});
export const delegatedMkAuthority: TenantAuthority = mintTestTenantAuthority('tenant_mk', {
  userId: 'super-1',
  role: 'super_admin',
});

export { mocks };
