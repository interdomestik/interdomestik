import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUserRolesPanel } from './admin-user-roles-panel';

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const rbacMocks = vi.hoisted(() => ({
  listBranches: vi.fn(async (_params?: unknown) => ({ success: true as const, data: [] })),
  listUserRoles: vi.fn(async (_params?: unknown) => ({
    success: true as const,
    data: [] as Array<{ id: string; role: string; branchId: string | null }>,
  })),
  grantUserRole: vi.fn(async () => ({ success: true })),
  revokeUserRole: vi.fn(async () => ({ success: true })),
  createBranch: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/actions/admin-rbac', () => rbacMocks);

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: navigationMocks.refresh,
  }),
  useParams: () => ({ locale: 'en' }),
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
  beforeEach(() => {
    navigationMocks.refresh.mockReset();
  });

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

  it('grants role, refreshes data, and calls router.refresh', async () => {
    rbacMocks.listUserRoles
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: 'role-1', role: 'member', branchId: null }],
      });

    render(<AdminUserRolesPanel userId="user-1" />);

    await waitFor(() => {
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Grant role' }));

    await waitFor(() => {
      expect(rbacMocks.grantUserRole).toHaveBeenCalledWith({
        tenantId: 'tenant_xk',
        userId: 'user-1',
        role: 'member',
        branchId: undefined,
        locale: 'en',
      });
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(2);
      expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    });
  });

  it('shows remove action, revokes role, and refreshes router', async () => {
    rbacMocks.listUserRoles
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: 'role-1', role: 'agent', branchId: null }],
      })
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<AdminUserRolesPanel userId="user-1" />);

    const removeButton = await screen.findByRole('button', { name: 'Remove' });
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(rbacMocks.revokeUserRole).toHaveBeenCalledWith({
        tenantId: 'tenant_xk',
        userId: 'user-1',
        role: 'agent',
        branchId: undefined,
        locale: 'en',
      });
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(2);
      expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
      expect(screen.getByText('No roles assigned')).toBeInTheDocument();
    });
  });
});
