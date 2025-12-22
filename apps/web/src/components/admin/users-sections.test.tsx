import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersSections } from './users-sections';

// Mock UsersTable
vi.mock('@/components/admin/users-table', () => ({
  UsersTable: ({ users }: { users: unknown[] }) => (
    <div data-testid="users-table">Users: {users.length}</div>
  ),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'sections.members': 'Assigned Members',
      'sections.unassigned': 'Unassigned Members',
      'sections.agents': 'Agents',
      'sections.staff': 'Staff & Admins',
      no_users: 'No users found',
    };
    return translations[key] || key;
  },
}));

// Mock cn utility
vi.mock('@interdomestik/ui', () => ({
  cn: (...args: (string | undefined | false)[]) => args.filter(Boolean).join(' '),
}));

const mockAgents = [{ id: 'agent-1', name: 'Agent Smith' }];

const mockUsers = [
  {
    id: 'user-1',
    name: 'John Member',
    email: 'john@example.com',
    role: 'user',
    image: null,
    agentId: 'agent-1',
    createdAt: new Date('2024-01-15'),
  },
  {
    id: 'user-2',
    name: 'Jane Unassigned',
    email: 'jane@example.com',
    role: 'user',
    image: null,
    agentId: null,
    createdAt: new Date('2024-01-14'),
  },
  {
    id: 'agent-1',
    name: 'Agent Smith',
    email: 'agent@example.com',
    role: 'agent',
    image: null,
    agentId: null,
    createdAt: new Date('2024-01-13'),
  },
  {
    id: 'admin-1',
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'admin',
    image: null,
    agentId: null,
    createdAt: new Date('2024-01-12'),
  },
];

describe('UsersSections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no users', () => {
    render(<UsersSections users={[]} agents={mockAgents} />);
    expect(screen.getByText('No users found')).toBeInTheDocument();
  });

  it('renders assigned members section', () => {
    render(<UsersSections users={mockUsers} agents={mockAgents} />);
    expect(screen.getByText('Assigned Members')).toBeInTheDocument();
  });

  it('renders unassigned members section', () => {
    render(<UsersSections users={mockUsers} agents={mockAgents} />);
    expect(screen.getByText('Unassigned Members')).toBeInTheDocument();
  });

  it('renders agents section', () => {
    render(<UsersSections users={mockUsers} agents={mockAgents} />);
    expect(screen.getByText('Agents')).toBeInTheDocument();
  });

  it('renders staff section', () => {
    render(<UsersSections users={mockUsers} agents={mockAgents} />);
    expect(screen.getByText('Staff & Admins')).toBeInTheDocument();
  });

  it('renders UsersTable for each section', () => {
    render(<UsersSections users={mockUsers} agents={mockAgents} />);
    const tables = screen.getAllByTestId('users-table');
    expect(tables.length).toBeGreaterThan(0);
  });
});
