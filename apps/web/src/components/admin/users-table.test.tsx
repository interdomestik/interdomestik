import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersTable } from './users-table';

// Mock router
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      'headers.user': 'User',
      'headers.role': 'Role',
      'headers.assigned_agent': 'Assigned Agent',
      'headers.joined': 'Joined',
      view_profile: 'View Profile',
      select_agent: 'Select Agent',
      unassigned: 'Unassigned',
      no_users: 'No users found',
      success_message: 'Agent updated successfully',
      message_alert: `${params?.count || 0} new message(s)`,
      'roles.user': 'Member',
      'roles.agent': 'Agent',
      'roles.admin': 'Admin',
      none: 'None',
      'errors.generic': 'An error occurred',
    };
    return translations[key] || key;
  },
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock action
vi.mock('@/actions/admin-users', () => ({
  updateUserAgent: vi.fn().mockResolvedValue({}),
}));

// Mock UI components
vi.mock('@interdomestik/ui/components/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  AvatarImage: () => null,
}));

vi.mock('@interdomestik/ui/components/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@interdomestik/ui/components/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <button {...props}>{children}</button>,
}));

vi.mock('@interdomestik/ui/components/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock('@interdomestik/ui/components/table', () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
}));

const mockUsers = [
  {
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com',
    role: 'user',
    image: null,
    agentId: null,
    createdAt: new Date('2024-01-15'),
  },
  {
    id: 'user-2',
    name: 'Jane Agent',
    email: 'jane@example.com',
    role: 'agent',
    image: null,
    agentId: null,
    createdAt: new Date('2024-01-10'),
  },
];

const mockAgents = [
  { id: 'agent-1', name: 'Agent Smith' },
  { id: 'agent-2', name: 'Agent Johnson' },
];

describe('UsersTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders table headers', () => {
    render(<UsersTable users={mockUsers} agents={mockAgents} />);

    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Assigned Agent')).toBeInTheDocument();
    expect(screen.getByText('Joined')).toBeInTheDocument();
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

  it('renders agent select for user role', () => {
    render(<UsersTable users={mockUsers} agents={mockAgents} />);

    // Agent select should be rendered for users with role 'user'
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });
});
