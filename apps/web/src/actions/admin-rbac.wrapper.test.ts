import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createBranch,
  deleteBranch,
  grantUserRole,
  listBranches,
  listUserRoles,
  revokeUserRole,
  updateBranch,
} from './admin-rbac.core';
import * as context from './admin-users/context';
import type { Session } from './admin-users/context.core';

// Mock Domain Functions
const mockListBranchesCore = vi.fn();
const mockCreateBranchCore = vi.fn();
const mockUpdateBranchCore = vi.fn();
const mockDeleteBranchCore = vi.fn();
const mockListUserRolesCore = vi.fn();
const mockGrantUserRoleCore = vi.fn();
const mockRevokeUserRoleCore = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock('@interdomestik/domain-users/admin/rbac', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listBranchesCore: (...args: any[]) => mockListBranchesCore(...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createBranchCore: (...args: any[]) => mockCreateBranchCore(...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateBranchCore: (...args: any[]) => mockUpdateBranchCore(...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteBranchCore: (...args: any[]) => mockDeleteBranchCore(...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listUserRolesCore: (...args: any[]) => mockListUserRolesCore(...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  grantUserRoleCore: (...args: any[]) => mockGrantUserRoleCore(...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  revokeUserRoleCore: (...args: any[]) => mockRevokeUserRoleCore(...args),
}));

vi.mock('./admin-users/context');
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1' },
      })),
    },
  },
}));
vi.mock('@/server/auth/effective-portal-access', () => ({
  requireEffectivePortalAccessOrUnauthorized: vi.fn(async () => undefined),
}));
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

describe('admin-rbac.core', () => {
  const MOCK_BRANCH_ID = '550e8400-e29b-41d4-a716-446655440000';

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

  describe('listBranches', () => {
    it('should call domain function with session', async () => {
      const mockParams = { tenantId: 'tenant-1' };
      const mockResult = [] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      mockListBranchesCore.mockResolvedValue(mockResult);

      const result = await listBranches(mockParams);

      expect(mockListBranchesCore).toHaveBeenCalledWith(
        expect.objectContaining({
          session: expect.objectContaining({ user: expect.anything() }),
          tenantId: 'tenant-1',
        })
      );
      expect(result).toEqual({ success: true, data: mockResult });
    });
  });

  describe('createBranch', () => {
    it('should call domain function with correct params', async () => {
      const params = { name: 'Branch 1', code: 'B1' };
      const mockResult = { branchId: 'new-id' };
      mockCreateBranchCore.mockResolvedValue(mockResult);

      const result = await createBranch(params);

      // We only check the first argument (context/input object)
      // The second argument is usually 'undefined' or not passed explicitly in wrapper calls unless it's for something specific
      expect(mockCreateBranchCore).toHaveBeenCalledWith(
        expect.objectContaining({
          session: expect.objectContaining({ user: expect.anything() }),
          name: 'Branch 1',
          code: 'B1',
        }),
        expect.anything()
      );
      expect(result).toEqual({ success: true, data: mockResult });
    });
  });

  describe('updateBranch', () => {
    it('should call domain function with correct params', async () => {
      const params = {
        branchId: MOCK_BRANCH_ID,
        data: { name: 'Updated', isActive: true, code: undefined },
      };
      const mockResult = { id: MOCK_BRANCH_ID, name: 'Updated' };
      mockUpdateBranchCore.mockResolvedValue(mockResult);

      const result = await updateBranch(params);

      expect(mockUpdateBranchCore).toHaveBeenCalledWith(
        expect.objectContaining({
          session: expect.objectContaining({ user: expect.anything() }),
          branchId: MOCK_BRANCH_ID,
          name: 'Updated',
          isActive: true,
          // code might be null or undefined depending on schema, assume matches input
        })
      );
      expect(result).toEqual({ success: true, data: mockResult });
    });
  });

  describe('deleteBranch', () => {
    it('should call domain function', async () => {
      const params = { branchId: MOCK_BRANCH_ID };
      const mockResult = {};
      mockDeleteBranchCore.mockResolvedValue(mockResult);

      const result = await deleteBranch(params);

      // Core passes 'branchId', test previously expected 'id'
      expect(mockDeleteBranchCore).toHaveBeenCalledWith(
        expect.objectContaining({
          session: expect.objectContaining({ user: expect.anything() }),
          branchId: MOCK_BRANCH_ID,
        })
      );
      expect(result).toEqual({ success: true, data: undefined });
    });
  });

  describe('listUserRoles', () => {
    it('should call domain function with correct params', async () => {
      const params = { userId: '123e4567-e89b-12d3-a456-426614174000', tenantId: 'tenant-1' };
      const mockResult = [] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      mockListUserRolesCore.mockResolvedValue(mockResult);

      const result = await listUserRoles(params);

      expect(mockListUserRolesCore).toHaveBeenCalledWith(
        expect.objectContaining({
          session: expect.objectContaining({ user: expect.anything() }),
          userId: params.userId,
          tenantId: params.tenantId,
        })
      );
      expect(result).toEqual({ success: true, data: mockResult });
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
        expect.objectContaining({ tenantId: 'tenant-1' })
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
        expect.objectContaining({ tenantId: 'tenant-1' })
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
        expect.objectContaining({ tenantId: 'tenant-1' })
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
});
