import { vi } from 'vitest';

// vi.hoisted declarations cannot be exported directly, so the mocks live in a local object and are
// re-exported below. These are the guarded production exports, shared by all action wrapper tests.
const mocks = vi.hoisted(() => ({
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
  listBranchesCore: mocks.mockListBranchesCore,
  createGuardedBranchCore: mocks.mockCreateGuardedBranchCore,
  updateGuardedBranchCore: mocks.mockUpdateGuardedBranchCore,
  deleteBranchCore: mocks.mockDeleteBranchCore,
  listUserRolesCore: mocks.mockListUserRolesCore,
  grantUserRoleCore: mocks.mockGrantUserRoleCore,
  revokeUserRoleCore: mocks.mockRevokeUserRoleCore,
}));

vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  delegateSuperAdminTenant: (...args: unknown[]) => mocks.mockDelegateSuperAdminTenant(...args),
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
  revalidatePath: (...args: unknown[]) => mocks.mockRevalidatePath(...args),
}));

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
} = mocks;
