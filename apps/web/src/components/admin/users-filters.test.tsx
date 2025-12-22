import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersFilters } from './users-filters';

// Mock router
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      search: 'Search',
      search_placeholder: 'Search users...',
      'roles.all': 'All Roles',
      'roles.user': 'Members',
      'roles.agent': 'Agents',
      'roles.staff': 'Staff',
      'roles.admin': 'Admins',
      'assignments.all': 'All',
      'assignments.assigned': 'Assigned',
      'assignments.unassigned': 'Unassigned',
      'labels.role': 'Role',
      'labels.assignment': 'Assignment',
    };
    return translations[key] || key;
  },
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Badge: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLSpanElement> & { children: React.ReactNode; variant?: string }) => (
    <span {...props}>{children}</span>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

describe('UsersFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders search input', () => {
    render(<UsersFilters />);
    expect(screen.getByPlaceholderText('Search users...')).toBeInTheDocument();
  });

  it('renders role filter badges', () => {
    render(<UsersFilters />);

    expect(screen.getByText('All Roles')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.getByText('Staff')).toBeInTheDocument();
    expect(screen.getByText('Admins')).toBeInTheDocument();
  });

  it('renders assignment filter badges', () => {
    render(<UsersFilters />);

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Assigned')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('renders filter labels', () => {
    render(<UsersFilters />);

    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Assignment')).toBeInTheDocument();
  });
});
