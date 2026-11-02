import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mockCreateBranchCore,
  mockDelegateSuperAdminTenant,
  mockGrantUserRoleCore,
  mockListBranchesCore,
  mockListUserRolesCore,
  mockRevalidatePath,
  mockRevokeUserRoleCore,
  mockUpdateBranchCore,
} from './admin-rbac.wrapper.test-support';
import { auth } from '@/lib/auth';
import {
  createBranch,
  grantUserRole,
  listBranches,
  listUserRoles,
  revokeUserRole,
  updateBranch,
} from './admin-rbac.core';
import * as context from './admin-users/context';
import type { Session } from './admin-users/context.core';

describe('admin-rbac.core', () => {
  const mockSession = {
    user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1' },
  } as unknown as NonNullable<Session>;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(context, 'getActionContext').mockResolvedValue({
      session: mockSession,
      requestHeaders: new Headers(),
    });
  });

  describe('tenant guard', () => {
    it('derives tenantId from session when grantUserRole tenantId is missing', async () => {
      mockGrantUserRoleCore.mockResolvedValueOnce({ success: true });
      const result = await grantUserRole({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        role: 'member',
      });

      expect(mockGrantUserRoleCore).toHaveBeenCalledWith(
        expect.objectContaining({ authority: expect.anything() })
      );
      expect(result.success).toBe(true);
    });

    it('derives tenantId from session when revokeUserRole tenantId is missing', async () => {
      mockRevokeUserRoleCore.mockResolvedValueOnce({ success: true });
      const result = await revokeUserRole({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        role: 'member',
        locale: 'en',
      });

      expect(mockRevokeUserRoleCore).toHaveBeenCalledWith(
        expect.objectContaining({ authority: expect.anything() })
      );
      expect(result.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        '/en/admin/users/123e4567-e89b-12d3-a456-426614174000'
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith('/en/admin/users');
    });

    it('ignores provided tenantId for non-super-admin revoke and uses session tenant', async () => {
      mockRevokeUserRoleCore.mockResolvedValueOnce({ success: true });

      const result = await revokeUserRole({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        role: 'agent',
        tenantId: 'tenant-foreign',
      });

      expect(mockRevokeUserRoleCore).toHaveBeenCalledWith(
        expect.objectContaining({ authority: expect.anything() })
      );
      expect(result.success).toBe(true);
    });

    it('returns BRANCH_REQUIRED when grant role is branch-scoped without branch', async () => {
      mockGrantUserRoleCore.mockResolvedValueOnce({ error: 'Branch is required for role: agent' });

      const result = await grantUserRole({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        role: 'agent',
        tenantId: 'tenant-1',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('BRANCH_REQUIRED');
        expect(result.error).toBe('Branch is required for role: agent');
      }
    });
  });

  describe('client tenant id never chooses the tenant', () => {
    const USER_ID = '123e4567-e89b-12d3-a456-426614174000';
    const BRANCH_ID = '550e8400-e29b-41d4-a716-446655440000';

    const cases = [
      {
        name: 'listBranches',
        domain: mockListBranchesCore,
        invoke: (tenantId: string) => listBranches({ tenantId }),
      },
      {
        name: 'createBranch',
        domain: mockCreateBranchCore,
        invoke: (tenantId: string) => createBranch({ name: 'Branch 1', code: 'B1', tenantId }),
      },
      {
        name: 'updateBranch',
        domain: mockUpdateBranchCore,
        invoke: (tenantId: string) =>
          updateBranch({
            branchId: BRANCH_ID,
            data: { name: 'Updated', isActive: true, tenantId },
          }),
      },
      {
        name: 'listUserRoles',
        domain: mockListUserRolesCore,
        invoke: (tenantId: string) => listUserRoles({ userId: USER_ID, tenantId }),
      },
      {
        name: 'grantUserRole',
        domain: mockGrantUserRoleCore,
        invoke: (tenantId: string) => grantUserRole({ userId: USER_ID, role: 'member', tenantId }),
      },
      {
        name: 'revokeUserRole',
        domain: mockRevokeUserRoleCore,
        invoke: (tenantId: string) => revokeUserRole({ userId: USER_ID, role: 'member', tenantId }),
      },
    ];

    function asRole(role: string) {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: 'admin-1', role, tenantId: 'tenant-1' },
      } as never);
    }

    beforeEach(() => {
      for (const { domain } of cases) domain.mockResolvedValue({ success: true });
    });

    it.each(cases)('$name ignores the client tenant id for a non-super_admin', async c => {
      asRole('admin');

      await c.invoke('tenant-foreign');

      expect(mockDelegateSuperAdminTenant).not.toHaveBeenCalled();
      const input = c.domain.mock.calls[0]?.[0];
      expect(readTenantAuthority(input.authority).tenantId).toBe('tenant-1');
      expect(input).not.toHaveProperty('tenantId');
    });

    it.each(cases)('$name delegates a super_admin to the requested tenant', async c => {
      asRole('super_admin');
      const delegated = mintTestTenantAuthority('tenant-foreign');
      mockDelegateSuperAdminTenant.mockResolvedValue(delegated);

      await c.invoke('tenant-foreign');

      expect(mockDelegateSuperAdminTenant).toHaveBeenCalledTimes(1);
      const [sessionAuthority, requested] = mockDelegateSuperAdminTenant.mock.calls[0] ?? [];
      expect(readTenantAuthority(sessionAuthority).tenantId).toBe('tenant-1');
      expect(requested).toBe('tenant-foreign');
      const input = c.domain.mock.calls[0]?.[0];
      expect(input.authority).toBe(delegated);
      expect(input).not.toHaveProperty('tenantId');
    });

    it.each(cases)(
      '$name uses the session authority when a super_admin names its own tenant',
      async c => {
        asRole('super_admin');

        await c.invoke('tenant-1');

        expect(mockDelegateSuperAdminTenant).not.toHaveBeenCalled();
        expect(readTenantAuthority(c.domain.mock.calls[0]?.[0].authority).tenantId).toBe(
          'tenant-1'
        );
      }
    );

    it.each(cases)('$name fails closed when the delegation is refused', async c => {
      asRole('super_admin');
      mockDelegateSuperAdminTenant.mockResolvedValue(null);

      const result = await c.invoke('tenant-unknown');

      expect(result.success).toBe(false);
      expect(c.domain).not.toHaveBeenCalled();
    });
  });
});
