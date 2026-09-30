import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

vi.mock('@/components/admin/add-agent-dialog', () => ({
  AddAgentDialog: (props: unknown) => {
    addAgentDialog(props);
    return <div data-testid="add-agent-dialog" />;
  },
}));

vi.mock('@/components/admin/admin-users-search-provider', () => ({
  AdminUsersSearchProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/admin/admin-users-role-tabs', () => ({
  AdminUsersRoleTabs: () => <div data-testid="admin-users-role-tabs" />,
}));

vi.mock('@/components/admin/users-filters', () => ({
  UsersFilters: () => <div data-testid="users-filters" />,
}));

vi.mock('@/components/admin/users-sections', () => ({
  UsersSections: () => <div data-testid="users-sections" />,
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

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}));

describe('AdminUsersPage', () => {
  it('supplies promotable users to the add-agent dialog even on the agent tab', async () => {
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

    expect(getAgents).toHaveBeenCalledOnce();
    expect(
      addAgentDialog.mock.calls.at(-1)?.[0].users.map((user: { id: string }) => user.id)
    ).toEqual(['staff-1', 'member-1']);
    expect(screen.getByTestId('add-agent-dialog')).toBeInTheDocument();
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
    expect(addAgentDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        users: expect.arrayContaining([
          expect.objectContaining({
            id: 'staff-1',
            name: 'Staff Candidate',
            email: 'staff@example.com',
          }),
          expect.objectContaining({
            id: 'member-1',
            name: 'Member Candidate',
            email: 'member@example.com',
          }),
        ]),
      })
    );
  });
  it('does not load unused agent choices on the Staff tab', async () => {
    vi.clearAllMocks();
    getUsers.mockResolvedValue({ success: true, data: [] });
    getUserChoices.mockResolvedValue({ success: true, data: [] });
    listBranches.mockResolvedValue({ success: true, data: [] });
    await AdminUsersPage({
      searchParams: Promise.resolve({ role: 'admin,staff', search: 'no-match' }),
    });
    expect(getUsers).toHaveBeenCalledOnce();
    expect(getUserChoices).toHaveBeenCalledOnce();
    expect(getAgents).not.toHaveBeenCalled();
  });
});
