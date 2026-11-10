import { vi } from 'vitest';

// These are the guarded production exports, shared by all action wrapper tests.
export const {
  mockListBranchesCore,
  mockCreateGuardedBranchCore,
  mockUpdateGuardedBranchCore,
  mockDeleteBranchCore,
  mockListUserRolesCore,
  mockGrantUserRoleCore,
  mockRevokeUserRoleCore,
  mockRevalidatePath,
  mockDelegateSuperAdminTenant,
} = vi.hoisted(() => ({
  mockListBranchesCore: vi.fn(),
  mockCreateGuardedBranchCore: vi.fn(),
  mockUpdateGuardedBranchCore: vi.fn(),
  mockDeleteBranchCore: vi.fn(),
  mockListUserRolesCore: vi.fn(),
  mockGrantUserRoleCore: vi.fn(),
  mockRevokeUserRoleCore: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockDelegateSuperAdminTenant: vi.fn(),
}));

vi.mock('@interdomestik/domain-users/admin/rbac', () => ({
  listBranchesCore: mockListBranchesCore,
  createGuardedBranchCore: mockCreateGuardedBranchCore,
  updateGuardedBranchCore: mockUpdateGuardedBranchCore,
  deleteBranchCore: mockDeleteBranchCore,
  listUserRolesCore: mockListUserRolesCore,
  grantUserRoleCore: mockGrantUserRoleCore,
  revokeUserRoleCore: mockRevokeUserRoleCore,
}));

vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  delegateSuperAdminTenant: (...args: unknown[]) => mockDelegateSuperAdminTenant(...args),
}));
vi.mock('./admin-users/context');
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(() =>
        Promise.resolve({
          user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1' },
        })
      ),
    },
  },
}));
vi.mock('@/server/auth/effective-portal-access', () => ({
  requireEffectivePortalAccessOrUnauthorized: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));
