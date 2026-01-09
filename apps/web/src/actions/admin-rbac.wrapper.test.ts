import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createBranch,
  deleteBranch,
  listBranches,
  listUserRoles,
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
const mockAssignUserRolesCore = vi.fn();

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
  assignUserRolesCore: (...args: any[]) => mockAssignUserRolesCore(...args),
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
});
