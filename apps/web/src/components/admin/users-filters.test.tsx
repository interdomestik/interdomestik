import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersFilters } from './users-filters';

const { pushMock, searchParamsMock, pathnameMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  searchParamsMock: vi.fn(() => new URLSearchParams()),
  pathnameMock: vi.fn(() => '/admin/users'),
}));

// Mock router
vi.mock('@/i18n/routing', () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({
    push: pushMock,
  }),
}));

// Mock navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
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
      'assignments.unassigned': 'Company-owned',
      'labels.role': 'Role',
      'labels.assignment': 'Assignment',
      processing: 'Processing...',
    };
    return translations[key] || key;
  },
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  badgeVariants: () => 'badge',
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

describe('UsersFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathnameMock.mockReturnValue('/admin/users');
    searchParamsMock.mockReturnValue(new URLSearchParams());
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
    expect(screen.getByText('Company-owned')).toBeInTheDocument();
  });

  it('renders filter labels', () => {
    render(<UsersFilters />);

    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Assignment')).toBeInTheDocument();
  });

  it('shows pending feedback and makes controls inert during assignment filter navigation', () => {
    render(<UsersFilters />);

    fireEvent.click(screen.getByTestId('admin-users-assignment-filter-assigned'));

    expect(pushMock).toHaveBeenCalledWith('/admin/users?assignment=assigned', { scroll: false });
    expect(screen.getByTestId('admin-users-filter-region')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('admin-users-filters-pending')).toHaveTextContent('Processing...');
    expect(screen.getByTestId('admin-users-search-input')).toBeDisabled();
    expect(screen.getByTestId('admin-users-assignment-filter-unassigned')).toBeDisabled();

    fireEvent.click(screen.getByTestId('admin-users-assignment-filter-unassigned'));

    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it('keeps active filters inert and avoids redundant same-query navigation', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('assignment=assigned&search=john&page=2'));

    render(<UsersFilters />);

    expect(screen.getByTestId('admin-users-assignment-filter-assigned')).toBeDisabled();
    fireEvent.click(screen.getByTestId('admin-users-assignment-filter-assigned'));
    fireEvent.change(screen.getByTestId('admin-users-search-input'), {
      target: { value: 'john' },
    });

    expect(pushMock).not.toHaveBeenCalled();
  });

  it('resets pagination and preserves query context for search navigation', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('tenantId=tenant_ks&page=3'));

    render(<UsersFilters hideRole hideAssignment />);

    fireEvent.change(screen.getByTestId('admin-users-search-input'), {
      target: { value: 'ada' },
    });

    expect(pushMock).toHaveBeenCalledWith('/admin/users?tenantId=tenant_ks&search=ada', {
      scroll: false,
    });
  });

  it('preserves the literal search term all while treating filter all as a sentinel', () => {
    searchParamsMock.mockReturnValue(
      new URLSearchParams('tenantId=tenant_ks&assignment=assigned&page=2')
    );

    render(<UsersFilters hideRole />);

    fireEvent.change(screen.getByTestId('admin-users-search-input'), {
      target: { value: 'all' },
    });

    expect(pushMock).toHaveBeenCalledWith(
      '/admin/users?tenantId=tenant_ks&assignment=assigned&search=all',
      { scroll: false }
    );
  });
});
