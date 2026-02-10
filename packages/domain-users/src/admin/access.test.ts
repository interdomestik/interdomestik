import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  return {
    db: { select },
    userRoles: {
      id: 'user_roles.id',
      tenantId: 'user_roles.tenant_id',
      userId: 'user_roles.user_id',
      role: 'user_roles.role',
      branchId: 'user_roles.branch_id',
    },
    and: vi.fn((...parts: unknown[]) => ({ op: 'and', parts })),
    eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
    isNull: vi.fn((value: unknown) => ({ op: 'isNull', value })),
    or: vi.fn((...parts: unknown[]) => ({ op: 'or', parts })),
    withTenant: vi.fn((tenantId: string, tenantColumn: unknown, filter: unknown) => ({
      op: 'withTenant',
      tenantId,
      tenantColumn,
      filter,
    })),
    ensureTenantId: vi.fn(() => 'tenant_ks'),
    limit,
  };
});

vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  db: mocks.db,
  eq: mocks.eq,
  userRoles: mocks.userRoles,
}));

vi.mock('drizzle-orm', () => ({
  isNull: mocks.isNull,
  or: mocks.or,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));

import { hasEffectiveRole, userHasRole } from './access';

describe('admin access role resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limit.mockResolvedValue([]);
  });

  it('treats undefined branch scope as any-branch lookup', async () => {
    mocks.limit.mockResolvedValue([{ id: 'role-1' }]);

    const hasRole = await userHasRole({
      session: {
        user: { id: 'u1', role: 'member', tenantId: 'tenant_ks' },
      },
      role: 'agent',
    });

    expect(hasRole).toBe(true);
    expect(mocks.isNull).not.toHaveBeenCalled();
  });

  it('treats branch-scoped checks as satisfied by global role rows', async () => {
    mocks.limit.mockResolvedValue([{ id: 'role-1' }]);

    const hasRole = await userHasRole({
      session: {
        user: { id: 'u1', role: 'member', tenantId: 'tenant_ks' },
      },
      role: 'agent',
      branchId: 'branch-a',
    });

    expect(hasRole).toBe(true);
    expect(mocks.or).toHaveBeenCalledTimes(1);
  });

  it('keeps member access always enabled in effective roles', async () => {
    const hasRole = await hasEffectiveRole({
      session: {
        user: { id: 'u1', role: 'member', tenantId: 'tenant_ks' },
      },
      role: 'member',
    });

    expect(hasRole).toBe(true);
    expect(mocks.db.select).not.toHaveBeenCalled();
  });

  it('uses user_roles as canonical when available (ignores legacy-only mismatch)', async () => {
    mocks.limit.mockResolvedValue([{ role: 'staff', branchId: null }]);

    const hasRole = await hasEffectiveRole({
      session: {
        user: { id: 'u1', role: 'agent', tenantId: 'tenant_ks' },
      },
      role: 'agent',
    });

    expect(hasRole).toBe(false);
    expect(mocks.db.select).toHaveBeenCalledTimes(1);
  });

  it('falls back to legacy role when no user_roles rows exist', async () => {
    mocks.limit.mockResolvedValue([]);

    const hasRole = await hasEffectiveRole({
      session: {
        user: { id: 'u1', role: 'agent', tenantId: 'tenant_ks' },
      },
      role: 'agent',
    });

    expect(hasRole).toBe(true);
  });
});
