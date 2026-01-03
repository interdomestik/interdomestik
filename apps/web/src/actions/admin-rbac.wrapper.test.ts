import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as rbacDomain from '@interdomestik/domain-users/admin/rbac';

import { createBranch, deleteBranch, listBranches, updateBranch } from './admin-rbac.core';
import * as context from './admin-users/context';

vi.mock('@interdomestik/domain-users/admin/rbac');
vi.mock('./admin-users/context');

describe('admin-rbac.core', () => {
  const mockSession = { user: { id: 'admin-1', role: 'admin' } };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(context, 'getActionContext').mockResolvedValue({ session: mockSession } as any);
  });

  describe('listBranches', () => {
    it('should call domain function with session', async () => {
      const mockParams = { tenantId: 'tenant-1' };
      const mockResult = { success: true, data: [] };
      vi.spyOn(rbacDomain, 'listBranchesCore').mockResolvedValue(mockResult as any);

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
      const mockResult = { success: true, data: { id: '1', ...params } };
      vi.spyOn(rbacDomain, 'createBranchCore').mockResolvedValue(mockResult as any);

      const result = await createBranch(params);

      expect(rbacDomain.createBranchCore).toHaveBeenCalledWith({
        session: mockSession,
        name: 'Branch 1',
        code: 'B1',
        tenantId: undefined,
      });
      expect(result).toBe(mockResult);
    });
  });

  describe('updateBranch', () => {
    it('should call domain function with correct params', async () => {
      const params = { branchId: '1', name: 'Updated', isActive: true };
      const mockResult = { success: true };
      vi.spyOn(rbacDomain, 'updateBranchCore').mockResolvedValue(mockResult as any);

      const result = await updateBranch(params);

      expect(rbacDomain.updateBranchCore).toHaveBeenCalledWith({
        session: mockSession,
        branchId: '1',
        name: 'Updated',
        code: null,
        isActive: true,
        tenantId: undefined,
      });
      expect(result).toBe(mockResult);
    });
  });

  describe('deleteBranch', () => {
    it('should call domain function', async () => {
      const params = { branchId: '1' };
      const mockResult = { success: true };
      vi.spyOn(rbacDomain, 'deleteBranchCore').mockResolvedValue(mockResult as any);

      const result = await deleteBranch(params);

      expect(rbacDomain.deleteBranchCore).toHaveBeenCalledWith({
        session: mockSession,
        branchId: '1',
        tenantId: undefined,
      });
      expect(result).toBe(mockResult);
    });
  });
});
