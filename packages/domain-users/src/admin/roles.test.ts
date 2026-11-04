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

  type Locked = { role: string; branchId: string | null };
  type Grant = { role: string; branchId: string | null };

  // Mocks one grant: the branch lookup (when a branch is named) and the locked user transaction.
  function mockGrant(locked: Locked, grants: Grant[], branchLookup = true) {
    const set = vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'user-1' }]) })),
    }));
    const writes = {
      update: vi.fn(() => ({ set })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'role-1' }]) })),
      })),
    };
    if (branchLookup) {
      mocks.withTenantContext.mockImplementationOnce(async (_scope, run) =>
        run({
          query: {
            branches: {
              findFirst: vi.fn().mockResolvedValue({ id: 'ks_branch_a', isActive: true }),
            },
          },
        })
      );
    }
    mocks.withTenantContext.mockImplementationOnce(async (_scope, run) =>
      run({
        select: vi.fn(() => ({
          from: () => ({ where: () => ({ for: vi.fn().mockResolvedValue([locked]) }) }),
        })),
        query: { userRoles: { findMany: vi.fn().mockResolvedValue(grants) } },
        ...writes,
      })
    );
    return { set, writes };
  }

  it.each([
    ['its membership', 'branch_manager', { role: 'member', branchId: 'ks_branch_b' }, []],
    [
      'another role grant',
      'branch_manager',
      { role: 'agent', branchId: null },
      [{ role: 'agent', branchId: 'ks_branch_b' }],
    ],
    [
      'the same role being replaced',
      'agent',
      { role: 'agent', branchId: null },
      [{ role: 'agent', branchId: 'ks_branch_b' }],
    ],
  ])(
    'rejects a grant in another branch than %s and writes nothing',
    async (_, role, locked, grants) => {
      const { writes } = mockGrant(locked, grants);

      await expect(
        grantUserRoleCore(
          { session, authority, userId: 'user-1', role, branchId: 'ks_branch_a' },
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
    }
  );

  it('adds a second role in the branch the user already belongs to', async () => {
    const { set, writes } = mockGrant({ role: 'agent', branchId: 'ks_branch_a' }, [
      { role: 'agent', branchId: 'ks_branch_a' },
    ]);

    await expect(
      grantUserRoleCore({
        session,
        authority,
        userId: 'user-1',
        role: 'branch_manager',
        branchId: 'ks_branch_a',
      })
    ).resolves.toEqual({ success: true });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'ks_branch_a' }));
    expect(writes.insert).toHaveBeenCalled();
  });

  it('clears the branch when a branch member is granted a tenant-wide role', async () => {
    const { set } = mockGrant({ role: 'member', branchId: 'ks_branch_a' }, [], false);

    await expect(
      grantUserRoleCore({ session, authority, userId: 'user-1', role: 'staff' })
    ).resolves.toEqual({ success: true });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ role: 'staff', branchId: null }));
  });

  it('never grants a tenant-wide agent role, even legacy flags are ignored', async () => {
    const legacyRequest = { session, authority, userId: 'user-1', role: 'agent' };

    await expect(
      grantUserRoleCore({ ...legacyRequest, allowLegacyTenantWide: true } as typeof legacyRequest)
    ).resolves.toEqual({ error: 'Branch is required for role: agent' });
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });
});
