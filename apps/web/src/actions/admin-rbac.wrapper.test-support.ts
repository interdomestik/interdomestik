import { vi } from 'vitest';

// Mock Domain Functions
export const mockListBranchesCore = vi.fn();
export const mockCreateBranchCore = vi.fn();
export const mockUpdateBranchCore = vi.fn();
export const mockDeleteBranchCore = vi.fn();
export const mockListUserRolesCore = vi.fn();
export const mockGrantUserRoleCore = vi.fn();
export const mockRevokeUserRoleCore = vi.fn();
export const mockRevalidatePath = vi.fn();
export const mockDelegateSuperAdminTenant = vi.fn();

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
