import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUserRolesPanel } from './admin-user-roles-panel';
import { translationFns } from './admin-user-roles-panel.test-support';

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
  locale: 'en',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: navigationMocks.refresh,
  }),
  useParams: () => ({ locale: navigationState.locale }),
}));

vi.mock('@/lib/roles-i18n', () => ({
  getRoleLabel: vi.fn((_tCommon: unknown, role: string) => `role:${role}`),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    if (namespace !== 'admin.users_page.roles_panel') {
      return (key: string) => key;
    }
    return navigationState.locale === 'mk' ? translationFns.mk : translationFns.en;
  },
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
    navigationState.locale = 'en';
    for (const mock of Object.values(rbacMocks)) mock.mockReset();

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
        allowLegacyTenantWide: false,
      });
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(2);
      expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    });

    rendered.unmount();
    render(<AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />);
    await waitFor(() => {
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(3);
      expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
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

    rendered.unmount();
    render(<AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />);

    await waitFor(() => {
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(3);
      expect(screen.getByText('No roles assigned')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    });
  });

  it('disables role actions and skips role mutations when tenantId is missing', async () => {
    navigationState.tenantId = null;

    render(<AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />);

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
    render(<AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />);

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

  it('offers supported tenant roles including staff without a custom-role path', async () => {
    render(<AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />);

    await waitFor(() => {
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId('role-select-trigger'));

    // Contract: staff role must be grantable/revokable for P2.5.
    expect(screen.getByTestId('role-option-staff')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(6);
    expect(screen.queryByTestId('role-option-custom')).not.toBeInTheDocument();
    expect(rbacMocks.grantUserRole).not.toHaveBeenCalled();
  });

  it('renders Macedonian labels on the mk admin user detail route', async () => {
    navigationState.locale = 'mk';

    render(<AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />);

    await waitFor(() => {
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Улоги')).toBeInTheDocument();
    expect(screen.getAllByText('Улога').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Филијала').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Додели улога' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Акции' })).toBeInTheDocument();
  });
});
