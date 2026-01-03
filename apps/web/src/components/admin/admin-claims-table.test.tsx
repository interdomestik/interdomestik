import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminClaimsTable } from './admin-claims-table';

// Mock react-query
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
}));

import { useQuery } from '@tanstack/react-query';
const mockUseQuery = vi.mocked(useQuery);

// Mock search params
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('tenantId=tenant_mk&search=hello'),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      'table.claimant': 'Claimant',
      'table.title': 'Title',
      'table.status': 'Status',
      'table.amount': 'Amount',
      'table.date': 'Date',
      'table.actions': 'Actions',
      'table.no_claims': 'No claims found.',
      'sections.active': 'Active Claims',
      'sections.draft': 'Draft Claims',
      'sections.resolved': 'Resolved Claims',
      message_alert: `New message (${params?.count || 0})`,
      loading: 'Loading...',
      'errors.generic': 'An error occurred',
      tryAgain: 'Try Again',
      view: 'View',
      previous: 'Previous',
      next: 'Next',
      'pagination.pageOf': `Page ${params?.page} of ${params?.total}`,
      submitted: 'Submitted',
      verification: 'Verification',
      resolved: 'Resolved',
      rejected: 'Rejected',
      draft: 'Draft',
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

// Mock fetchClaims
vi.mock('@/lib/api/claims', () => ({
  fetchClaims: vi.fn(),
}));

const mockClaims = [
  {
    id: 'claim-1',
    title: 'Active Claim',
    claimantName: 'John Doe',
    claimantEmail: 'john@example.com',
    category: 'auto',
    status: 'verification',
    claimAmount: '1000',
    currency: 'EUR',
    createdAt: '2024-01-15T10:00:00Z',
    unreadCount: 0,
  },
  {
    id: 'claim-2',
    title: 'Draft Claim',
    claimantName: 'Jane Smith',
    claimantEmail: 'jane@example.com',
    category: 'insurance',
    status: 'draft',
    claimAmount: '2500',
    currency: 'EUR',
    createdAt: '2024-01-14T10:00:00Z',
    unreadCount: 0,
  },
  {
    id: 'claim-3',
    title: 'Resolved Claim',
    claimantName: 'Bob Wilson',
    claimantEmail: 'bob@example.com',
    category: 'consumer',
    status: 'resolved',
    claimAmount: '500',
    currency: 'EUR',
    createdAt: '2024-01-13T10:00:00Z',
    unreadCount: 0,
  },
];

describe('AdminClaimsTable', () => {
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

    render(<AdminClaimsTable />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders error state', () => {
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<AdminClaimsTable />);

    expect(screen.getByText('An error occurred')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('renders no claims message for empty array', () => {
    mockUseQuery.mockReturnValue({
      data: { claims: [], totalPages: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<AdminClaimsTable />);

    // The translation mock returns the key when not found
    expect(screen.getByText('no_claims')).toBeInTheDocument();
  });

  it('renders claims sections with data', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: mockClaims, totalPages: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<AdminClaimsTable />);

    await waitFor(() => {
      expect(screen.getByText('Active Claims')).toBeInTheDocument();
    });
  });

  it('displays claimant information', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: mockClaims, totalPages: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<AdminClaimsTable />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
    });
  });

  it('groups claims by status', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: mockClaims, totalPages: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<AdminClaimsTable />);

    await waitFor(() => {
      // Should have sections for active, draft, and resolved
      expect(screen.getByText('Active Claims')).toBeInTheDocument();
      expect(screen.getByText('Draft Claims')).toBeInTheDocument();
      expect(screen.getByText('Resolved Claims')).toBeInTheDocument();
    });
  });

  it('shows view buttons for claims', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: [mockClaims[0]], totalPages: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<AdminClaimsTable />);

    await waitFor(() => {
      expect(screen.getByText('View')).toBeInTheDocument();
    });
  });

  it('preserves query params in claim detail links', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: [mockClaims[0]], totalPages: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<AdminClaimsTable />);

    const link = await screen.findByRole('link', { name: 'View' });
    const href = link.getAttribute('href');
    expect(href).toBeTruthy();

    const url = new URL(href!, 'http://test.local');
    expect(url.pathname).toBe('/admin/claims/claim-1');
    expect(url.searchParams.get('tenantId')).toBe('tenant_mk');
    expect(url.searchParams.get('search')).toBe('hello');
  });

  it('shows pagination when multiple pages', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: mockClaims, totalPages: 5 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<AdminClaimsTable />);

    await waitFor(() => {
      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
      expect(screen.getByText('Page 1 of 5')).toBeInTheDocument();
    });
  });
});
