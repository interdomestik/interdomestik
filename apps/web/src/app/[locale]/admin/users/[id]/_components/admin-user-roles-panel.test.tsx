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

const navigationState = vi.hoisted(() => ({
  tenantId: 'tenant_xk' as string | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: navigationMocks.refresh,
  }),
  useParams: () => ({ locale: 'en' }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'tenantId' ? navigationState.tenantId : null),
    toString: () => (navigationState.tenantId ? `tenantId=${navigationState.tenantId}` : ''),
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
    navigationState.tenantId = 'tenant_xk';
    rbacMocks.listBranches.mockReset();
    rbacMocks.listUserRoles.mockReset();
    rbacMocks.grantUserRole.mockReset();
    rbacMocks.revokeUserRole.mockReset();
    rbacMocks.createBranch.mockReset();

    rbacMocks.listBranches.mockResolvedValue({ success: true, data: [] });
    rbacMocks.listUserRoles.mockResolvedValue({ success: true, data: [] });
    rbacMocks.grantUserRole.mockResolvedValue({ success: true });
    rbacMocks.revokeUserRole.mockResolvedValue({ success: true });
    rbacMocks.createBranch.mockResolvedValue({ success: true });
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
      })
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: 'role-1', role: 'member', branchId: null }],
      });

    const rendered = render(<AdminUserRolesPanel userId="user-1" />);

    await waitFor(() => {
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(1);
    });

    const grantButton = screen.getByRole('button', { name: 'Grant role' });
    await waitFor(() => {
      expect(grantButton).toBeEnabled();
    });
    fireEvent.click(grantButton);

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

    rendered.unmount();
    render(<AdminUserRolesPanel userId="user-1" />);
    await waitFor(() => {
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(3);
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

  it('disables role actions and skips role mutations when tenantId is missing', async () => {
    navigationState.tenantId = null;

    render(<AdminUserRolesPanel userId="user-1" />);

    expect(
      screen.getByText('Missing tenant context. Reopen this profile from the tenant user list.')
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(rbacMocks.listBranches).not.toHaveBeenCalled();
      expect(rbacMocks.listUserRoles).not.toHaveBeenCalled();
    });

    const grantButton = screen.getByRole('button', { name: 'Grant role' });
    expect(grantButton).toBeDisabled();
    fireEvent.click(grantButton);

    await waitFor(() => {
      expect(rbacMocks.grantUserRole).not.toHaveBeenCalled();
      expect(rbacMocks.revokeUserRole).not.toHaveBeenCalled();
    });
  });

  it('disables grant when selected role requires branch and branch is tenant-wide', async () => {
    render(<AdminUserRolesPanel userId="user-1" />);

    await waitFor(() => {
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId('role-select-trigger'));
    fireEvent.click(screen.getByTestId('role-option-agent'));

    const grantButton = screen.getByRole('button', { name: 'Grant role' });
    expect(grantButton).toBeDisabled();
    fireEvent.click(grantButton);

    await waitFor(() => {
      expect(rbacMocks.grantUserRole).not.toHaveBeenCalled();
    });
  });
});
