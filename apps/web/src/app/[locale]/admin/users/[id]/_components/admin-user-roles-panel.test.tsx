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
}));

vi.mock('@/lib/roles-i18n', () => ({
  getRoleLabel: vi.fn((_tCommon: unknown, role: string) => `role:${role}`),
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
    render(<AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />);

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

    const rendered = render(
      <AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />
    );

    await waitFor(() => {
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(1);
    });

    const grantButton = screen.getByRole('button', { name: 'grant_role' });
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
        allowLegacyTenantWide: false,
      });
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(2);
      expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'remove' })).toBeInTheDocument();
    });

    rendered.unmount();
    render(<AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />);
    await waitFor(() => {
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(3);
      expect(screen.getByRole('button', { name: 'remove' })).toBeInTheDocument();
    });
  });

  it('shows remove action, revokes role, and removal sticks after refresh', async () => {
    rbacMocks.listUserRoles
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: 'role-1', role: 'agent', branchId: null }],
      })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [] });

    const rendered = render(
      <AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />
    );

    const removeButton = await screen.findByRole('button', { name: 'remove' });
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
      expect(screen.getByText('empty')).toBeInTheDocument();
    });

    rendered.unmount();
    render(<AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />);

    await waitFor(() => {
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(3);
      expect(screen.getByText('empty')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'remove' })).not.toBeInTheDocument();
    });
  });

  it('disables role actions and skips role mutations when tenantId is missing', async () => {
    navigationState.tenantId = null;

    render(<AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />);

    expect(screen.getByText('missing_tenant')).toBeInTheDocument();

    await waitFor(() => {
      expect(rbacMocks.listBranches).not.toHaveBeenCalled();
      expect(rbacMocks.listUserRoles).not.toHaveBeenCalled();
    });

    const grantButton = screen.getByRole('button', { name: 'grant_role' });
    expect(grantButton).toBeDisabled();
    fireEvent.click(grantButton);

    await waitFor(() => {
      expect(rbacMocks.grantUserRole).not.toHaveBeenCalled();
      expect(rbacMocks.revokeUserRole).not.toHaveBeenCalled();
    });
  });

  it('disables grant when selected role requires branch and branch is tenant-wide', async () => {
    render(<AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />);

    await waitFor(() => {
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId('role-select-trigger'));
    fireEvent.click(screen.getByTestId('role-option-agent'));

    const grantButton = screen.getByRole('button', { name: 'grant_role' });
    expect(grantButton).toBeDisabled();
    fireEvent.click(grantButton);

    await waitFor(() => {
      expect(rbacMocks.grantUserRole).not.toHaveBeenCalled();
    });
  });

  it('allows restoring a legacy tenant-wide agent role without forcing branch selection', async () => {
    rbacMocks.listUserRoles
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: 'legacy-agent', role: 'agent', branchId: null }],
      })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: 'legacy-agent-restored', role: 'agent', branchId: null }],
      });

    render(<AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />);

    const removeButton = await screen.findByRole('button', { name: 'remove' });
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(rbacMocks.revokeUserRole).toHaveBeenCalledWith({
        tenantId: 'tenant_xk',
        userId: 'user-1',
        role: 'agent',
        branchId: undefined,
        locale: 'en',
      });
    });

    fireEvent.click(screen.getByTestId('role-select-trigger'));
    fireEvent.click(screen.getByTestId('role-option-agent'));

    const grantButton = screen.getByRole('button', { name: 'grant_role' });
    await waitFor(() => {
      expect(grantButton).toBeEnabled();
    });
    fireEvent.click(grantButton);

    await waitFor(() => {
      expect(rbacMocks.grantUserRole).toHaveBeenCalledWith({
        tenantId: 'tenant_xk',
        userId: 'user-1',
        role: 'agent',
        branchId: undefined,
        locale: 'en',
        allowLegacyTenantWide: true,
      });
    });
  });

  it('offers staff as a grantable role option', async () => {
    render(<AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />);

    await waitFor(() => {
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId('role-select-trigger'));

    // Contract: staff role must be grantable/revokable for P2.5.
    expect(screen.getByTestId('role-option-staff')).toBeInTheDocument();
  });

  it('renders tenant-wide label instead of an empty dash for null branch roles', async () => {
    rbacMocks.listUserRoles.mockResolvedValueOnce({
      success: true,
      data: [{ id: 'role-1', role: 'agent', branchId: null }],
    });

    render(<AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />);

    await waitFor(() => {
      expect(screen.getByText('tenant_wide')).toBeInTheDocument();
      expect(screen.queryByText('—')).not.toBeInTheDocument();
    });
  });

  it('renders localized role labels instead of raw role ids', async () => {
    rbacMocks.listUserRoles.mockResolvedValueOnce({
      success: true,
      data: [{ id: 'role-1', role: 'agent', branchId: null }],
    });

    render(<AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />);

    await waitFor(() => {
      expect(screen.getAllByText('role:agent').length).toBeGreaterThan(0);
      expect(screen.queryByText(/^agent$/)).not.toBeInTheDocument();
    });
  });

  it('enables create branch only when a branch name is provided', async () => {
    render(<AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />);

    const createButton = screen.getByRole('button', { name: 'create_branch' });
    expect(createButton).toBeDisabled();

    const branchNameInput = screen.getAllByRole('textbox')[0];
    fireEvent.change(branchNameInput, { target: { value: 'New Branch' } });

    await waitFor(() => {
      expect(createButton).toBeEnabled();
    });
  });
});
