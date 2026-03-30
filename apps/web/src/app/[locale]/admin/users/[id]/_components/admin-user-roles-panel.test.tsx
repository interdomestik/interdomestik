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
  locale: 'en',
}));

const translationFns = vi.hoisted(() => {
  const mkValues = {
    title: 'Улоги',
    description: 'Улоги со опсег на tenant за овој корисник.',
    missing_tenant:
      'Недостасува tenant контекст. Повторно отворете го овој профил од листата на корисници за tenant-от.',
    tenant_wide: 'На ниво на tenant',
    role_label: 'Улога',
    branch_label: 'Филијала',
    role_placeholder: 'Избери улога',
    custom_role: 'Прилагодена…',
    custom_role_placeholder: 'Име на улога',
    new_branch_name: 'Име на нова филијала',
    new_branch_code: 'Нова шифра на филијала (опционално)',
    grant_role: 'Додели улога',
    remove: 'Отстрани',
    create_branch: 'Креирај филијала',
    empty: 'Нема доделени улоги',
    'table.role': 'Улога',
    'table.branch': 'Филијала',
    'table.actions': 'Дејства',
    'toasts.load_branches_error': 'Неуспешно вчитување филијали',
    'toasts.load_roles_error': 'Неуспешно вчитување улоги',
    'toasts.tenant_required': 'Потребен е tenant контекст за управување со улоги',
    'toasts.role_required': 'Улогата е задолжителна',
    'toasts.branch_required': 'За оваа улога е задолжителна филијала. Изберете филијала.',
    'toasts.role_granted': 'Улогата е доделена',
    'toasts.grant_error': 'Неуспешно доделување улога',
    'toasts.role_revoked': 'Улогата е отповикана',
    'toasts.revoke_error': 'Неуспешно отповикување улога',
    'toasts.branch_name_required': 'Името на филијалата е задолжително',
    'toasts.branch_created': 'Филијалата е креирана',
    'toasts.branch_create_error': 'Неуспешно креирање филијала',
  } as const;

  const enValues = {
    title: 'Roles',
    description: 'Tenant-scoped roles for this user.',
    missing_tenant: 'Missing tenant context. Reopen this profile from the tenant user list.',
    tenant_wide: 'Tenant-wide',
    role_label: 'Role',
    branch_label: 'Branch',
    role_placeholder: 'Select role',
    custom_role: 'Custom…',
    custom_role_placeholder: 'Role name',
    new_branch_name: 'New branch name',
    new_branch_code: 'New branch code (optional)',
    grant_role: 'Grant role',
    remove: 'Remove',
    create_branch: 'Create branch',
    empty: 'No roles assigned',
    'table.role': 'Role',
    'table.branch': 'Branch',
    'table.actions': 'Actions',
    'toasts.load_branches_error': 'Failed to load branches',
    'toasts.load_roles_error': 'Failed to load roles',
    'toasts.tenant_required': 'Tenant context is required to manage roles',
    'toasts.role_required': 'Role is required',
    'toasts.branch_required': 'Branch is required for this role. Please select a branch.',
    'toasts.role_granted': 'Role granted',
    'toasts.grant_error': 'Failed to grant role',
    'toasts.role_revoked': 'Role revoked',
    'toasts.revoke_error': 'Failed to revoke role',
    'toasts.branch_name_required': 'Branch name is required',
    'toasts.branch_created': 'Branch created',
    'toasts.branch_create_error': 'Failed to create branch',
  } as const;

  return {
    mk: (key: string) => mkValues[key as keyof typeof mkValues] ?? key,
    en: (key: string) => enValues[key as keyof typeof enValues] ?? key,
  };
});

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

  it('offers staff as a grantable role option', async () => {
    render(<AdminUserRolesPanel userId="user-1" tenantId={navigationState.tenantId} />);

    await waitFor(() => {
      expect(rbacMocks.listUserRoles).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId('role-select-trigger'));

    // Contract: staff role must be grantable/revokable for P2.5.
    expect(screen.getByTestId('role-option-staff')).toBeInTheDocument();
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
    expect(screen.getByRole('columnheader', { name: 'Дејства' })).toBeInTheDocument();
  });
});
