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
    missing_tenant_context:
      'Недостасува tenant контекст. Повторно отворете го овој профил од листата на корисници за tenant-от.',
    tenant_wide: 'На ниво на tenant',
    'fields.role': 'Улога',
    'fields.branch': 'Филијала',
    'fields.select_role': 'Избери улога',
    'fields.custom_role': 'Прилагодена…',
    'fields.role_name': 'Име на улога',
    'fields.new_branch_name': 'Име на нова филијала',
    'fields.new_branch_code': 'Нова шифра на филијала (опционално)',
    'actions.grant': 'Додели улога',
    'actions.remove': 'Отстрани',
    'actions.create_branch': 'Креирај филијала',
    'table.empty': 'Нема доделени улоги',
    'table.actions': 'Дејства',
    'toast.load_branches_failed': 'Неуспешно вчитување филијали',
    'toast.load_roles_failed': 'Неуспешно вчитување улоги',
    'toast.tenant_context_required_roles': 'Потребен е tenant контекст за управување со улоги',
    'toast.tenant_context_required_branches':
      'Потребен е tenant контекст за управување со филијали',
    'toast.role_required': 'Улогата е задолжителна',
    'toast.branch_required': 'За оваа улога е задолжителна филијала. Изберете филијала.',
    'toast.role_granted': 'Улогата е доделена',
    'toast.grant_failed': 'Неуспешно доделување улога',
    'toast.role_revoked': 'Улогата е отповикана',
    'toast.revoke_failed': 'Неуспешно отповикување улога',
    'toast.branch_name_required': 'Името на филијалата е задолжително',
    'toast.branch_created': 'Филијалата е креирана',
    'toast.branch_create_failed': 'Неуспешно креирање филијала',
  } as const;

  const enValues = {
    title: 'Roles',
    description: 'Tenant-scoped roles for this user.',
    missing_tenant_context:
      'Missing tenant context. Reopen this profile from the tenant user list.',
    tenant_wide: 'Tenant-wide',
    'fields.role': 'Role',
    'fields.branch': 'Branch',
    'fields.select_role': 'Select role',
    'fields.custom_role': 'Custom…',
    'fields.role_name': 'Role name',
    'fields.new_branch_name': 'New branch name',
    'fields.new_branch_code': 'New branch code (optional)',
    'actions.grant': 'Grant role',
    'actions.remove': 'Remove',
    'actions.create_branch': 'Create branch',
    'table.empty': 'No roles assigned',
    'table.actions': 'Actions',
    'toast.load_branches_failed': 'Failed to load branches',
    'toast.load_roles_failed': 'Failed to load roles',
    'toast.tenant_context_required_roles': 'Tenant context is required to manage roles',
    'toast.tenant_context_required_branches': 'Tenant context is required to manage branches',
    'toast.role_required': 'Role is required',
    'toast.branch_required': 'Branch is required for this role. Please select a branch.',
    'toast.role_granted': 'Role granted',
    'toast.grant_failed': 'Failed to grant role',
    'toast.role_revoked': 'Role revoked',
    'toast.revoke_failed': 'Failed to revoke role',
    'toast.branch_name_required': 'Branch name is required',
    'toast.branch_created': 'Branch created',
    'toast.branch_create_failed': 'Failed to create branch',
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

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    if (namespace !== 'admin.member_profile.roles_panel') {
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
