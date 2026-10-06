import { mockAgents, mockUsers } from './__tests__/users-table-fixtures';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersTable } from './users-table';
import { UsersSections } from './users-sections';

const TEST_URL_ORIGIN = 'https://test.local';

describe('UsersTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retains agent choices for Agent rows which also carry member capability', () => {
    render(<UsersSections users={[mockUsers[1]]} agents={mockAgents} />);
    expect(screen.getAllByText('Select Agent')).toHaveLength(2);
    expect(screen.getAllByText('Agent Smith')).toHaveLength(2);
  });

  it.each(['staff', 'admin'])(
    'renders real %s sections identically without agent choices',
    role => {
      const users = [{ ...mockUsers[1], role }];
      const view = render(<UsersSections users={users} agents={mockAgents} />);
      const baseline = view.container.innerHTML;
      view.rerender(<UsersSections users={users} agents={[]} />);
      expect(view.container.innerHTML).toBe(baseline);
      expect(screen.getByText('Jane Agent')).toBeInTheDocument();
      expect(screen.queryByText('Select Agent')).not.toBeInTheDocument();
      expect(screen.queryByText('Agent Smith')).not.toBeInTheDocument();
    }
  );

  it('preserves full users list query params in profile and alert links', () => {
    render(<UsersTable users={mockUsers} agents={mockAgents} />);

    const profileLinks = screen.getAllByRole('link', { name: 'View Profile' });
    expect(profileLinks).toHaveLength(2);

    const profileHref = profileLinks[0].getAttribute('href');
    expect(profileHref).toBeTruthy();
    const profileUrl = new URL(profileHref!, TEST_URL_ORIGIN);
    expect(profileUrl.pathname).toBe('/admin/users/user-1');

    // Full query string preserved
    expect(profileUrl.searchParams.get('tenantId')).toBe('tenant_mk');
    expect(profileUrl.searchParams.get('search')).toBe('john');
    expect(profileUrl.searchParams.get('role')).toBe('agent');
    expect(profileUrl.searchParams.get('assignment')).toBe('unassigned');
    expect(profileUrl.searchParams.get('sort')).toBe('name');
    expect(profileUrl.searchParams.get('dir')).toBe('asc');
    expect(profileUrl.searchParams.get('pageSize')).toBe('50');
    expect(profileUrl.searchParams.get('page')).toBe('2');

    const alertLink = screen.getByRole('link', { name: '3 new message(s)' });
    const alertHref = alertLink.getAttribute('href');
    expect(alertHref).toBeTruthy();
    const alertUrl = new URL(alertHref!, TEST_URL_ORIGIN);
    expect(alertUrl.pathname).toBe('/admin/claims/claim-1');

    // Destination query params preserved
    expect(alertUrl.searchParams.get('foo')).toBe('bar');

    // Full users list context also preserved
    expect(alertUrl.searchParams.get('tenantId')).toBe('tenant_mk');
    expect(alertUrl.searchParams.get('search')).toBe('john');
    expect(alertUrl.searchParams.get('role')).toBe('agent');
    expect(alertUrl.searchParams.get('assignment')).toBe('unassigned');
    expect(alertUrl.searchParams.get('sort')).toBe('name');
    expect(alertUrl.searchParams.get('dir')).toBe('asc');
    expect(alertUrl.searchParams.get('pageSize')).toBe('50');
    expect(alertUrl.searchParams.get('page')).toBe('2');
  });

  it('renders table headers', () => {
    render(<UsersTable users={mockUsers} agents={mockAgents} />);

    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Member / Account ID')).toBeInTheDocument();
    expect(screen.getByText('Assigned Agent')).toBeInTheDocument();
    expect(screen.getByText('Joined')).toBeInTheDocument();
  });

  it('shows member numbers for membership-backed rows and account ids for operator rows', () => {
    render(<UsersTable users={mockUsers} agents={mockAgents} />);

    expect(screen.getByText('MEM-2026-000001')).toBeInTheDocument();
    expect(screen.getByText('user-2')).toBeInTheDocument();
  });

  it('shows a tenant review badge for users pending later classification', () => {
    render(<UsersTable users={mockUsers} agents={mockAgents} />);

    expect(screen.getByText('Tenant review pending')).toBeInTheDocument();
  });

  it('renders user names', () => {
    render(<UsersTable users={mockUsers} agents={mockAgents} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Agent')).toBeInTheDocument();
  });

  it('renders user emails', () => {
    render(<UsersTable users={mockUsers} agents={mockAgents} />);

    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  it('renders user roles', () => {
    render(<UsersTable users={mockUsers} agents={mockAgents} />);

    expect(screen.getByText('Member')).toBeInTheDocument();
    expect(screen.getByText('Agent')).toBeInTheDocument();
  });

  it('renders view profile buttons', () => {
    render(<UsersTable users={mockUsers} agents={mockAgents} />);

    const profileButtons = screen.getAllByText('View Profile');
    expect(profileButtons.length).toBe(2);
  });

  it('renders empty state when no users', () => {
    render(<UsersTable users={[]} agents={mockAgents} showEmptyState />);

    expect(screen.getByText('No users found')).toBeInTheDocument();
  });

  it('renders company-owned option for user role', () => {
    render(<UsersTable users={mockUsers} agents={mockAgents} />);

    // Agent select should be rendered for users with role 'user'
    const companyOwnedElements = screen.getAllByText('Company-owned');
    expect(companyOwnedElements.length).toBeGreaterThan(0);
  });
});
