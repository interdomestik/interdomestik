import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as rbacDomain from '@interdomestik/domain-users/admin/rbac';

import {
  createBranch,
  deleteBranch,
  listBranches,
  listUserRoles,
  updateBranch,
} from './admin-rbac.core';
import * as context from './admin-users/context';
import type { Session } from './admin-users/context.core';

vi.mock('@interdomestik/domain-users/admin/rbac');
vi.mock('./admin-users/context');
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
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
      const mockResult = [] as Array<{
        id: string;
        name: string;
        slug: string;
        code: string | null;
        isActive: boolean;
        tenantId: string;
        createdAt: Date;
        updatedAt: Date;
      }>;
      vi.spyOn(rbacDomain, 'listBranchesCore').mockResolvedValue(
        mockResult as Awaited<ReturnType<typeof rbacDomain.listBranchesCore>>
      );

      const result = await listBranches(mockParams);

      expect(rbacDomain.listBranchesCore).toHaveBeenCalledWith({
        session: mockSession,
        tenantId: 'tenant-1',
      });
      expect(result).toBe(mockResult);
    });
  });

  describe('createBranch', () => {
    it('should call domain function with correct params', async () => {
      const params = { name: 'Branch 1', code: 'B1' };
      const mockResult = { success: true, data: { branchId: 'new-id' } };
      vi.spyOn(rbacDomain, 'createBranchCore').mockResolvedValue(
        mockResult as Awaited<ReturnType<typeof rbacDomain.createBranchCore>>
      );

      const result = await createBranch(params);

      expect(rbacDomain.createBranchCore).toHaveBeenCalledWith(
        {
          session: mockSession,
          name: 'Branch 1',
          code: 'B1',
          tenantId: undefined,
        },
        expect.anything()
      );
      expect(result).toBe(mockResult);
    });
  });

  describe('updateBranch', () => {
    it('should call domain function with correct params', async () => {
      const params = { branchId: MOCK_BRANCH_ID, name: 'Updated', isActive: true };
      const mockResult = { success: true };
      vi.spyOn(rbacDomain, 'updateBranchCore').mockResolvedValue(
        mockResult as Awaited<ReturnType<typeof rbacDomain.updateBranchCore>>
      );

      const result = await updateBranch(params);

      expect(rbacDomain.updateBranchCore).toHaveBeenCalledWith(
        {
          session: mockSession,
          branchId: MOCK_BRANCH_ID,
          name: 'Updated',
          code: null,
          isActive: true,
          tenantId: undefined,
        },
        expect.anything()
      );
      expect(result).toBe(mockResult);
    });
  });

  describe('deleteBranch', () => {
    it('should call domain function', async () => {
      const params = { branchId: MOCK_BRANCH_ID };
      const mockResult = { success: true };
      vi.spyOn(rbacDomain, 'deleteBranchCore').mockResolvedValue(
        mockResult as Awaited<ReturnType<typeof rbacDomain.deleteBranchCore>>
      );

      const result = await deleteBranch(params);

      expect(rbacDomain.deleteBranchCore).toHaveBeenCalledWith(
        {
          session: mockSession,
          branchId: MOCK_BRANCH_ID,
          tenantId: undefined,
        },
        expect.anything()
      );
      expect(result).toBe(mockResult);
    });
  });

  describe('listUserRoles', () => {
    it('should call domain function with correct params', async () => {
      const params = { userId: '123e4567-e89b-12d3-a456-426614174000', tenantId: 'tenant-1' };
      const mockResult = [] as any[];
      vi.spyOn(rbacDomain, 'listUserRolesCore').mockResolvedValue(mockResult);

      const result = await listUserRoles(params);

      expect(rbacDomain.listUserRolesCore).toHaveBeenCalledWith({
        session: mockSession,
        userId: params.userId,
        tenantId: params.tenantId,
      });
      expect(result).toBe(mockResult);
    });
  });
});
