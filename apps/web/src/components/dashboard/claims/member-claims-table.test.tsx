import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberClaimsTable } from './member-claims-table';
import { mockClaims } from './member-claims-table-test-support';

const hoisted = vi.hoisted(() => ({
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

// Mock react-query
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: vi.fn(),
}));

import { useQuery } from '@tanstack/react-query';
const mockUseQuery = vi.mocked(useQuery);

// Mock search params
vi.mock('next/navigation', () => ({
  useSearchParams: () => hoisted.searchParams,
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () =>
    Object.assign(
      (key: string) => {
        const translations: Record<string, string> = {
          'detail.continuity.caseLabel': 'Case',
          'table.company': 'Company',
          'table.category': 'Category',
          'table.status': 'Status',
          'table.amount': 'Amount',
          'table.created': 'Created',
          'table.unavailable': 'Unavailable',
          'empty.title': 'No claims yet',
          'empty.description': 'Start by creating your first claim',
          'empty.filtered': 'No claims match your filters',
          'empty.createFirst': 'Create First Claim',
          showing: 'Showing',
          claim: 'claim',
          claimsPlural: 'claims',
          loading: 'Loading...',
          processing: 'Processing...',
          'errors.generic': 'An error occurred',
          tryAgain: 'Try Again',
          previous: 'Previous',
          next: 'Next',
          'pagination.pageOf': 'Page {page} of {total}',
          auto: 'Auto',
          travel: 'Travel',
        };
        return translations[key] || key;
      },
      { has: (key: string) => key === 'auto' || key === 'travel' }
    ),
}));

// Mock routing
vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: React.ReactNode;
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => '/member/claims',
  useRouter: () => ({
    push: hoisted.push,
  }),
}));

// Mock ClaimStatusBadge
vi.mock('@/components/dashboard/claims/claim-status-badge', () => ({
  ClaimStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

// Mock fetchClaims
vi.mock('@/lib/api/claims', () => ({
  fetchClaims: vi.fn(),
}));

describe('MemberClaimsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.searchParams = new URLSearchParams();
  });

  it('renders loading state', () => {
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<MemberClaimsTable />);
    const status = screen.getByRole('status');
    const region = screen.getByRole('region');
    expect(status).toHaveTextContent('Loading...');
    expect(status).toBeInstanceOf(HTMLOutputElement);
    expect(status).not.toHaveAttribute('aria-busy');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toContainElement(status);
  });

  it('renders error state', async () => {
    const refetch = vi.fn().mockResolvedValue({ isSuccess: false });
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof useQuery>);

    render(<MemberClaimsTable />);
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('An error occurred');
    const retry = screen.getByRole('button', { name: 'Try Again' });
    expect(retry).toHaveAttribute('type', 'button');
    fireEvent.click(retry);
    await waitFor(() => expect(retry).toHaveTextContent('Try Again'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders empty state', () => {
    mockUseQuery.mockReturnValue({
      data: { claims: [], totalPages: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    const { unmount } = render(<MemberClaimsTable />);
    expect(screen.getByText('No claims yet')).toBeInTheDocument();
    expect(screen.getByText('Start by creating your first claim')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create First Claim' })).toHaveAttribute(
      'href',
      '/member/claims/new'
    );
    unmount();

    // The server-resolved entry replaces the dead-end intake for members without access.
    render(<MemberClaimsTable newCaseHref="/member/membership" newCaseLabel="View Plans" />);
    expect(screen.getByRole('link', { name: 'View Plans' })).toHaveAttribute(
      'href',
      '/member/membership'
    );
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
    expect(screen.getByRole('table')).toHaveClass('block', 'md:table');
    expect(screen.getByRole('table').querySelector('thead')).toHaveClass(
      'sr-only',
      'md:not-sr-only'
    );
    expect(screen.getByRole('table').querySelector('tbody')).toHaveClass(
      'block',
      'md:table-row-group'
    );
    const row = screen.getByRole('link', { name: 'Car Accident' }).closest('tr');
    expect(row).toHaveClass('grid', 'p-4', 'md:table-row', 'md:p-0');
    expect(row?.querySelectorAll('.md\\:hidden[aria-hidden]')).toHaveLength(5);
    expect(screen.getByText('memberList.resultStatus')).toHaveAttribute('aria-live', 'polite');
  });

  it('renders table headers', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: mockClaims, totalPages: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<MemberClaimsTable />);

    const headers = screen.getAllByRole('columnheader');
    expect(headers.map(header => header.textContent)).toEqual([
      'Case',
      'Status',
      'Company',
      'Category',
      'Amount',
      'Created',
    ]);
    expect(headers.every(header => header.getAttribute('scope') === 'col' && header.id)).toBe(true);
    expect(new Set(headers.map(header => header.id)).size).toBe(6);
    for (const row of screen.getByRole('table').querySelectorAll('tbody tr')) {
      expect(Array.from(row.querySelectorAll('td'), cell => cell.headers)).toEqual(
        headers.map(header => header.id)
      );
    }
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
