import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminUserRolesPanel } from './admin-user-roles-panel';

const rbacMocks = vi.hoisted(() => ({
  listBranches: vi.fn(async (_params?: any) => []),
  listUserRoles: vi.fn(async (_params?: any) => []),
  grantUserRole: vi.fn(async () => ({ success: true })),
  revokeUserRole: vi.fn(async () => ({ success: true })),
  createBranch: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/actions/admin-rbac', () => rbacMocks);

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === 'tenantId' ? 'tenant_xk' : null),
    toString: () => 'tenantId=tenant_xk',
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('AdminUserRolesPanel', () => {
  it('passes tenantId into listBranches and listUserRoles', async () => {
    render(<AdminUserRolesPanel userId="user-1" />);

    await waitFor(() => {
      expect(rbacMocks.listBranches).toHaveBeenCalled();
      expect(rbacMocks.listUserRoles).toHaveBeenCalled();
    });

    expect(rbacMocks.listBranches).toHaveBeenCalledWith({ tenantId: 'tenant_xk' });
    expect(rbacMocks.listUserRoles).toHaveBeenCalledWith({
      tenantId: 'tenant_xk',
      userId: 'user-1',
    });
  });
});
