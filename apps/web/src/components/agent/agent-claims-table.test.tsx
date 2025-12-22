import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentClaimsTable } from './agent-claims-table';

// Mock react-query
const mockUseQuery = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: unknown[]; queryFn: () => unknown }) => mockUseQuery(options),
}));

// Mock search params
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      'table.claimant': 'Claimant',
      'table.claim': 'Claim',
      'table.status': 'Status',
      'table.amount': 'Amount',
      'table.date': 'Date',
      'table.actions': 'Actions',
      'table.no_claims': 'No claims found.',
      'table.message_alert': `New message (${params?.count || 0})`,
      'actions.review': 'Review Case',
      loading: 'Loading...',
      'errors.generic': 'An error occurred',
      tryAgain: 'Try Again',
      previous: 'Previous',
      next: 'Next',
      'pagination.pageOf': `Page ${params?.page} of ${params?.total}`,
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
  ClaimStatusBadge: ({ status }: { status: string }) => (
    <span data-testid="status-badge">{status}</span>
  ),
}));

// Mock fetchClaims
vi.mock('@/lib/api/claims', () => ({
  fetchClaims: vi.fn(),
}));

const mockClaims = [
  {
    id: 'claim-1',
    title: 'Car Accident Claim',
    claimantName: 'John Doe',
    claimantEmail: 'john@example.com',
    companyName: 'Insurance Co',
    status: 'submitted',
    claimAmount: '1000',
    currency: 'EUR',
    createdAt: '2024-01-15T10:00:00Z',
    unreadCount: 0,
  },
  {
    id: 'claim-2',
    title: 'Property Damage',
    claimantName: 'Jane Smith',
    claimantEmail: 'jane@example.com',
    companyName: 'Property Ltd',
    status: 'verification',
    claimAmount: '2500',
    currency: 'EUR',
    createdAt: '2024-01-14T10:00:00Z',
    unreadCount: 3,
  },
];

describe('AgentClaimsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AgentClaimsTable />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders error state', () => {
    const mockRefetch = vi.fn();
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    });

    render(<AgentClaimsTable />);

    expect(screen.getByText('An error occurred')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('renders claims table with data', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: mockClaims, totalPages: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AgentClaimsTable />);

    await waitFor(() => {
      expect(screen.getByText('Claimant')).toBeInTheDocument();
      expect(screen.getByText('Claim')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
      expect(screen.getByText('Date')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });
  });

  it('displays claimant information', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: mockClaims, totalPages: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AgentClaimsTable />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });
  });

  it('displays claim titles and companies', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: mockClaims, totalPages: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AgentClaimsTable />);

    await waitFor(() => {
      expect(screen.getByText('Car Accident Claim')).toBeInTheDocument();
      expect(screen.getByText('Insurance Co')).toBeInTheDocument();
      expect(screen.getByText('Property Damage')).toBeInTheDocument();
    });
  });

  it('displays claim amounts', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: mockClaims, totalPages: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AgentClaimsTable />);

    await waitFor(() => {
      expect(screen.getByText('1000 EUR')).toBeInTheDocument();
      expect(screen.getByText('2500 EUR')).toBeInTheDocument();
    });
  });

  it('shows unread message indicator for claims with new messages', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: mockClaims, totalPages: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AgentClaimsTable />);

    await waitFor(() => {
      expect(screen.getByText('New message (3)')).toBeInTheDocument();
    });
  });

  it('shows "View Status" for agent role', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: mockClaims, totalPages: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AgentClaimsTable userRole="agent" />);

    await waitFor(() => {
      // Agent role should see "View Status" instead of "Review Case"
      const viewStatusButtons = screen.getAllByText('View Status');
      expect(viewStatusButtons.length).toBe(2);
    });
  });

  it('shows empty state when no claims', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: [], totalPages: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AgentClaimsTable />);

    await waitFor(() => {
      expect(screen.getByText('No claims found.')).toBeInTheDocument();
    });
  });

  it('shows pagination when multiple pages exist', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: mockClaims, totalPages: 5 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AgentClaimsTable />);

    await waitFor(() => {
      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
      expect(screen.getByText('Page 1 of 5')).toBeInTheDocument();
    });
  });
});
