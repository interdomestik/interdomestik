import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withTenantContext: vi.fn(),
  withTenant: vi.fn((tenantId: string, _column: unknown, condition?: unknown) => ({
    tenantId,
    condition,
  })),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  audit: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: mocks.withTenantContext,
  withTenant: mocks.withTenant,
  eq: mocks.eq,
  and: vi.fn((...values: unknown[]) => values),
  branches: { id: 'branches.id', tenantId: 'branches.tenantId' },
  user: { id: 'user.id', tenantId: 'user.tenantId' },
  userRoles: {
    id: 'roles.id',
    tenantId: 'roles.tenantId',
    userId: 'roles.userId',
    role: 'roles.role',
  },
}));
vi.mock('@interdomestik/database/tenant-security', () => ({ withTenant: mocks.withTenant }));
vi.mock('@interdomestik/shared-auth', () => ({
  ensureAccessTenantId: (session: { user: { tenantId?: string } }) => session.user.tenantId,
  hasPermission: vi.fn(() => true),
  requirePermission: vi.fn(),
  PERMISSIONS: { 'roles.manage': 'roles.manage' },
}));
vi.mock('drizzle-orm', () => ({ isNull: vi.fn() }));

import { grantUserRoleCore } from './roles';

const session = { user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_ks' } };
const authority = mintTestTenantAuthority('tenant_ks', { userId: 'admin-1', role: 'admin' });

describe('authorized role writer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('grants an active same-tenant branch role and emits its audit record', async () => {
    mocks.withTenantContext
      .mockImplementationOnce(async (_scope, run) =>
        run({
          query: {
            branches: {
              findFirst: vi.fn().mockResolvedValue({ id: 'ks_branch_a', isActive: true }),
            },
          },
        })
      )
      .mockImplementationOnce(async (_scope, run) =>
        run({
          select: vi.fn(() => ({
            from: () => ({
              where: () => ({
                for: vi.fn().mockResolvedValue([{ role: 'member' }]),
              }),
            }),
          })),
          query: { userRoles: { findMany: vi.fn().mockResolvedValue([]) } },
          update: vi.fn(() => ({
            set: vi.fn(() => ({
              where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'user-1' }]) })),
            })),
          })),
          delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
          insert: vi.fn(() => ({
            values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'role-1' }]) })),
          })),
        })
      );

    await expect(
      grantUserRoleCore(
        {
          session,
          authority,
          userId: 'user-1',
          role: 'agent',
          branchId: 'ks_branch_a',
        },
        { logAuditEvent: mocks.audit }
      )
    ).resolves.toEqual({ success: true });
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant_ks',
      'branches.tenantId',
      expect.anything()
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.role_granted',
        authority,
        metadata: { role: 'agent', branchId: 'ks_branch_a' },
      })
    );
  });

  it('denies a foreign authority and invalid branch before any role mutation', async () => {
    await expect(
      grantUserRoleCore({
        session,
        authority: mintTestTenantAuthority('tenant_mk', { userId: 'other-admin', role: 'admin' }),
        userId: 'user-1',
        role: 'agent',
        branchId: 'mk_branch_a',
      })
    ).rejects.toThrow('Unauthorized');
    mocks.withTenantContext.mockImplementationOnce(async (_scope, run) =>
      run({
        query: { branches: { findFirst: vi.fn().mockResolvedValue(null) } },
      })
    );
    await expect(
      grantUserRoleCore({
        session,
        authority,
        userId: 'user-1',
        role: 'agent',
        branchId: 'ks_missing',
      })
    ).resolves.toEqual({ error: 'Invalid branch' });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([
    ['its branch membership', { branchId: 'ks_branch_b' }, []],
    ['an existing grant', { branchId: null }, [{ role: 'agent', branchId: 'ks_branch_b' }]],
  ])('rejects a grant in another branch than %s and writes nothing', async (_, row, grants) => {
    const writes = { update: vi.fn(), delete: vi.fn(), insert: vi.fn() };
    mocks.withTenantContext
      .mockImplementationOnce(async (_scope, run) =>
        run({
          query: {
            branches: {
              findFirst: vi.fn().mockResolvedValue({ id: 'ks_branch_a', isActive: true }),
            },
          },
        })
      )
      .mockImplementationOnce(async (_scope, run) =>
        run({
          select: vi.fn(() => ({
            from: () => ({
              where: () => ({ for: vi.fn().mockResolvedValue([{ role: 'agent', ...row }]) }),
            }),
          })),
          query: { userRoles: { findMany: vi.fn().mockResolvedValue(grants) } },
          ...writes,
        })
      );

    await expect(
      grantUserRoleCore(
        { session, authority, userId: 'user-1', role: 'branch_manager', branchId: 'ks_branch_a' },
        { logAuditEvent: mocks.audit }
      )
    ).resolves.toEqual({
      error: 'Role grants must stay in the user branch',
      code: 'BRANCH_MEMBERSHIP_CONFLICT',
    });
    expect(writes.update).not.toHaveBeenCalled();
    expect(writes.delete).not.toHaveBeenCalled();
    expect(writes.insert).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
