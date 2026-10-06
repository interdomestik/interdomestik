import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminUsersPage from './_core.entry';

const { getUsers, getAgents } = vi.hoisted(() => ({ getUsers: vi.fn(), getAgents: vi.fn() }));
vi.mock('@/actions/admin-users', () => ({ getUsers, getAgents }));
vi.mock('@/components/admin/add-agent-dialog', () => ({ AddAgentDialog: () => null }));
vi.mock('@/components/admin/admin-users-search-provider', () => ({
  AdminUsersSearchProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/admin/admin-users-role-tabs', () => ({ AdminUsersRoleTabs: () => null }));
vi.mock('@/components/admin/users-filters', () => ({ UsersFilters: () => null }));
vi.mock('@/components/admin/users-sections', () => ({
  UsersSections: (props: { users: unknown[]; assignmentChoicesAvailable?: boolean }) => (
    <div
      data-testid="users-sections"
      data-choices-available={props.assignmentChoicesAvailable}
      data-users={props.users.length}
    />
  ),
}));
vi.mock('@/components/admin/admin-users-read-recovery', () => ({
  AdminUsersReadRecovery: ({
    message,
    children,
  }: {
    message: string | null;
    children: React.ReactNode;
  }) => (
    <div>
      {message && <p role="alert">{message}</p>}
      {children}
    </div>
  ),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => (key: string) => `${namespace}.${key}`,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('TEST_NOT_FOUND');
  },
}));

describe('AdminUsersPage read recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getUsers.mockResolvedValue({ success: true, data: [{ id: 'member-1' }] });
    getAgents.mockResolvedValue({ success: true, data: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows recovery rather than false empty rows after a failed read', async () => {
    getUsers.mockResolvedValue({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      error: 'private sql detail',
    });
    render(
      await AdminUsersPage({
        searchParams: Promise.resolve({ search: 'kept', assignment: 'assigned', page: '2' }),
      })
    );
    expect(screen.getByRole('alert')).toHaveTextContent('admin.users_page.load_users_error');
    expect(screen.queryByTestId('users-sections')).not.toBeInTheDocument();
    expect(screen.queryByText('private sql detail')).not.toBeInTheDocument();
    expect(getUsers).toHaveBeenCalledWith({
      search: 'kept',
      role: 'user,member',
      assignment: 'assigned',
    });
    expect(screen.getByTestId('admin-users-page')).toBeInTheDocument();
  });

  it('keeps successful rows and blocks assignment when only choices fail', async () => {
    getAgents.mockResolvedValue({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      error: 'private detail',
    });
    render(await AdminUsersPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'admin.users_page.load_agent_choices_error'
    );
    expect(screen.getByTestId('users-sections')).toHaveAttribute('data-users', '1');
    expect(screen.getByTestId('users-sections')).toHaveAttribute('data-choices-available', 'false');
  });

  it('renders one main recovery when both reads fail', async () => {
    getUsers.mockResolvedValue({ success: false, code: 'INTERNAL_SERVER_ERROR' });
    getAgents.mockResolvedValue({ success: false, code: 'INTERNAL_SERVER_ERROR' });
    render(await AdminUsersPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('load_users_error');
    expect(screen.queryByTestId('users-sections')).not.toBeInTheDocument();
  });

  it.each(['user', 'agent', 'admin,staff'])(
    'keeps valid empty or skipped reads successful on %s',
    async role => {
      getUsers.mockResolvedValue({ success: true, data: [] });
      render(await AdminUsersPage({ searchParams: Promise.resolve({ role }) }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByTestId('users-sections')).toHaveAttribute('data-users', '0');
      expect(screen.getByTestId('users-sections')).toHaveAttribute(
        'data-choices-available',
        'true'
      );
      expect(getAgents).toHaveBeenCalledTimes(role === 'user' ? 1 : 0);
    }
  );

  it('keeps a choices denial closed even when users also fail without a denial', async () => {
    getUsers.mockResolvedValue({ success: false, code: 'INTERNAL_SERVER_ERROR' });
    getAgents.mockResolvedValue({ success: false, code: 'FORBIDDEN_SCOPE' });
    await expect(AdminUsersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'TEST_NOT_FOUND'
    );
  });

  it.each(['UNAUTHORIZED', 'FORBIDDEN', 'FORBIDDEN_SCOPE'])(
    'keeps either action denial %s closed before recovery',
    async code => {
      for (const denied of ['users', 'choices']) {
        getUsers.mockResolvedValue({ success: denied !== 'users', data: [], code });
        getAgents.mockResolvedValue({ success: denied !== 'choices', data: [], code });
        await expect(AdminUsersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
          'TEST_NOT_FOUND'
        );
      }
    }
  );
});
