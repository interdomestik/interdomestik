import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentUsersSections } from './agent-users-sections';

// Mock routing
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'headers.user': 'User',
      'headers.status': 'Status',
      'headers.plan': 'Plan',
      'headers.period_end': 'Expires',
      'headers.actions': 'Actions',
      'sections.attention': 'Needs Attention',
      'sections.all': 'All Members',
      view_profile: 'View Profile',
      no_users: 'No users found',
    };
    return translations[key] || key;
  },
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Button: ({
    children,
    asChild: _asChild,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <button {...props}>{children}</button>,
  cn: (...args: (string | undefined | false)[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@interdomestik/ui/components/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  AvatarImage: () => null,
}));

vi.mock('@interdomestik/ui/components/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
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
    agentId: 'agent-1',
    createdAt: new Date('2024-01-15'),
    unreadCount: 2,
    alertLink: '/member/claims/123',
  },
  {
    id: 'user-2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    role: 'user',
    image: null,
    agentId: 'agent-1',
    createdAt: new Date('2024-01-10'),
  },
];

describe('AgentUsersSections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no users', () => {
    render(<AgentUsersSections users={[]} />);
    expect(screen.getByText('No users found')).toBeInTheDocument();
  });

  it('renders user names', () => {
    render(<AgentUsersSections users={mockUsers} />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('renders section headers', () => {
    render(<AgentUsersSections users={mockUsers} />);
    expect(screen.getByText('Needs Attention')).toBeInTheDocument();
    expect(screen.getByText('All Members')).toBeInTheDocument();
  });

  it('renders view profile buttons', () => {
    render(<AgentUsersSections users={mockUsers} />);
    const profileButtons = screen.getAllByText('View Profile');
    expect(profileButtons.length).toBeGreaterThan(0);
  });

  it('renders table headers', () => {
    render(<AgentUsersSections users={mockUsers} />);
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });
});
