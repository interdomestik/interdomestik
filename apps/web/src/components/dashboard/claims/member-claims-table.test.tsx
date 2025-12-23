import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberClaimsTable } from './member-claims-table';

// Mock react-query
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
}));

import { useQuery } from '@tanstack/react-query';
const mockUseQuery = vi.mocked(useQuery);

// Mock search params
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'table.title': 'Title',
      'table.company': 'Company',
      'table.category': 'Category',
      'table.status': 'Status',
      'table.amount': 'Amount',
      'table.created': 'Created',
      'empty.title': 'No claims yet',
      'empty.description': 'Start by creating your first claim',
      'empty.filtered': 'No claims match your filters',
      'empty.createFirst': 'Create First Claim',
      showing: 'Showing',
      claim: 'claim',
      claimsPlural: 'claims',
      loading: 'Loading...',
      'errors.generic': 'An error occurred',
      tryAgain: 'Try Again',
      previous: 'Previous',
      next: 'Next',
      'pagination.pageOf': 'Page {page} of {total}',
    };
    return translations[key] || key;
  },
}));

// Mock routing
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock ClaimStatusBadge
vi.mock('@/components/dashboard/claims/claim-status-badge', () => ({
  ClaimStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

// Mock fetchClaims
vi.mock('@/lib/api/claims', () => ({
  fetchClaims: vi.fn(),
}));

const mockClaims = [
  {
    id: 'claim-1',
    title: 'Car Accident',
    companyName: 'State Farm',
    category: 'auto',
    status: 'submitted',
    claimAmount: '5000',
    currency: 'EUR',
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'claim-2',
    title: 'Flight Delay',
    companyName: 'Lufthansa',
    category: 'travel',
    status: 'verification',
    claimAmount: '600',
    currency: 'EUR',
    createdAt: '2024-01-14T10:00:00Z',
  },
];

describe('MemberClaimsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<MemberClaimsTable />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders error state', () => {
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<MemberClaimsTable />);
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    mockUseQuery.mockReturnValue({
      data: { claims: [], totalPages: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<MemberClaimsTable />);
    expect(screen.getByText('No claims yet')).toBeInTheDocument();
    expect(screen.getByText('Start by creating your first claim')).toBeInTheDocument();
  });

  it('renders claims table with data', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: mockClaims, totalPages: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<MemberClaimsTable />);

    await waitFor(() => {
      expect(screen.getByText('Car Accident')).toBeInTheDocument();
      expect(screen.getByText('State Farm')).toBeInTheDocument();
    });
  });

  it('renders table headers', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: mockClaims, totalPages: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<MemberClaimsTable />);

    await waitFor(() => {
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Company')).toBeInTheDocument();
      expect(screen.getByText('Category')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
    });
  });

  it('displays claim data correctly', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: mockClaims, totalPages: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<MemberClaimsTable />);

    await waitFor(() => {
      expect(screen.getByText('Flight Delay')).toBeInTheDocument();
      expect(screen.getByText('Lufthansa')).toBeInTheDocument();
    });
  });
});
