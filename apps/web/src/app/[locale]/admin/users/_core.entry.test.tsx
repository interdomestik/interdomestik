import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import './__tests__/admin-users-page-fixtures';
import AdminUsersPage from './_core.entry';

const { getUsers, getUserChoices, getAgents, listBranches, addAgentDialog } = vi.hoisted(() => ({
  getUsers: vi.fn(),
  getUserChoices: vi.fn(),
  getAgents: vi.fn(),
  listBranches: vi.fn(),
  addAgentDialog: vi.fn(),
}));

vi.mock('@/actions/admin-users', () => ({
  getUsers,
  getUserChoices,
  getAgents,
}));

vi.mock('@/actions/admin-rbac.core', () => ({
  listBranches,
}));

vi.mock('@/components/admin/add-agent-dialog', async importOriginal => {
  const actual = await importOriginal<typeof import('@/components/admin/add-agent-dialog')>();
  return {
    AddAgentDialog: (props: Parameters<typeof actual.AddAgentDialog>[0]) => {
      addAgentDialog(props);
      return (
        <div data-testid="add-agent-dialog">
          <actual.AddAgentDialog {...props} />
        </div>
      );
    },
  };
});

vi.mock('@/components/admin/admin-users-search-provider', () => ({
  AdminUsersSearchProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/admin/admin-users-role-tabs', () => ({
  AdminUsersRoleTabs: () => <div data-testid="admin-users-role-tabs" />,
}));

vi.mock('@/components/admin/users-filters', () => ({
  UsersFilters: () => <div data-testid="users-filters" />,
}));

vi.mock('@interdomestik/ui/components/button', () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
    children: React.ReactNode;
  }) => {
    if (asChild) return <>{children}</>;
    return <button {...props}>{children}</button>;
  },
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    return (key: string) => `${namespace}.${key}`;
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('TEST_NOT_FOUND');
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView'
);
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});
afterAll(() => {
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  }
});

describe('AdminUsersPage', () => {
  it('loads promotable users when the add-agent dialog opens on the agent tab', async () => {
    getUsers.mockResolvedValueOnce({
      success: true,
      data: [{ id: 'agent-1', role: 'agent', name: 'Existing Agent', email: 'agent@example.com' }],
    });
    getUserChoices.mockResolvedValueOnce({
      success: true,
      data: [
        { id: 'staff-1', role: 'staff', name: 'Staff Candidate', email: 'staff@example.com' },
        { id: 'member-1', role: 'member', name: 'Member Candidate', email: 'member@example.com' },
        { id: 'agent-1', role: 'agent', name: 'Existing Agent', email: 'agent@example.com' },
        { id: 'admin-1', role: 'admin', name: 'Admin', email: 'admin@example.com' },
      ],
    });
    getAgents.mockResolvedValue({
      success: true,
      data: [{ id: 'agent-1', name: 'Existing Agent' }],
    });
    listBranches.mockResolvedValue({
      success: true,
      data: [{ id: 'ks_branch_a', name: 'KS Branch A (Prishtina)' }],
    });

    render(
      await AdminUsersPage({
        searchParams: Promise.resolve({ role: 'agent' }),
      })
    );

    expect(getAgents).not.toHaveBeenCalled();
    expect(screen.getByTestId('add-agent-dialog')).toBeInTheDocument();
    expect(getUserChoices).not.toHaveBeenCalled();
    expect(listBranches).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'admin.users_page.add_agent' }));
    const userSelect = screen.getByRole('combobox', { name: 'admin.users_page.select_user' });
    await waitFor(() => expect(userSelect).not.toBeDisabled());
    fireEvent.keyDown(userSelect, { key: 'ArrowDown' });
    expect(await screen.findByRole('option', { name: 'Staff Candidate' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Member Candidate' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Existing Agent' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Admin' })).not.toBeInTheDocument();
    expect(getUsers).toHaveBeenNthCalledWith(1, {
      search: undefined,
      role: 'agent',
      assignment: undefined,
    });
    expect(getUserChoices).toHaveBeenCalledWith({
      search: undefined,
      role: 'user,member,staff',
      assignment: undefined,
    });
    expect(listBranches).toHaveBeenCalledWith({ includeInactive: false });
    expect(addAgentDialog).toHaveBeenCalledWith({ search: undefined });
  });
  it('does not load unused agent choices on the Staff tab', async () => {
    vi.clearAllMocks();
    getUsers.mockResolvedValue({ success: true, data: [] });
    getUserChoices.mockResolvedValue({ success: true, data: [] });
    listBranches.mockResolvedValue({ success: true, data: [] });
    render(
      await AdminUsersPage({
        searchParams: Promise.resolve({ role: 'admin,staff', search: 'no-match' }),
      })
    );
    expect(getUsers).toHaveBeenCalledOnce();
    expect(getUserChoices).not.toHaveBeenCalled();
    expect(listBranches).not.toHaveBeenCalled();
    expect(getAgents).not.toHaveBeenCalled();
  });
});

describe('AdminUsersPage search critical path', () => {
  it.each(['user', 'agent', 'admin,staff'])(
    'does not read unopened promotion choices or branches while searching %s',
    async role => {
      vi.clearAllMocks();
      getUsers.mockResolvedValue({ success: true, data: [] });
      getAgents.mockResolvedValue({ success: true, data: [] });
      getUserChoices.mockResolvedValue({ success: true, data: [] });
      listBranches.mockResolvedValue({ success: true, data: [] });
      render(
        await AdminUsersPage({
          searchParams: Promise.resolve({ role, search: 'Tracking', assignment: 'assigned' }),
        })
      );
      expect(getUsers).toHaveBeenCalledExactlyOnceWith({
        search: 'Tracking',
        role: role === 'user' ? 'user,member' : role,
        assignment: role === 'user' ? 'assigned' : undefined,
      });
      expect(getUserChoices).not.toHaveBeenCalled();
      expect(listBranches).not.toHaveBeenCalled();
      expect(getAgents).toHaveBeenCalledTimes(role === 'user' ? 1 : 0);
      expect(addAgentDialog).toHaveBeenCalledWith({ search: 'Tracking' });
      expect(screen.getByTestId('users-sections')).toBeInTheDocument();
    }
  );
});
