import { act, fireEvent, render, screen } from '@testing-library/react';
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

  it('shows deterministic pending feedback when pagination changes page', async () => {
    mockUseQuery.mockReturnValue({
      data: { claims: mockClaims, totalPages: 3 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<MemberClaimsTable />);

    fireEvent.click(screen.getByTestId('member-claims-page-next'));

    expect(hoisted.push).toHaveBeenCalledWith('/member/claims?page=2', { scroll: false });
    expect(screen.getByTestId('member-claims-table-region')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('member-claims-pagination-pending')).toHaveTextContent(
      'Processing...'
    );
  });

  it('keeps current and pending pagination controls inert', async () => {
    hoisted.searchParams = new URLSearchParams('page=2&search=claim');
    mockUseQuery.mockReturnValue({
      data: { claims: mockClaims, totalPages: 3 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    render(<MemberClaimsTable />);

    fireEvent.click(screen.getByTestId('member-claims-page-next'));
    const previous = screen.getByTestId('member-claims-page-previous');
    expect(previous).toHaveAttribute('href', '/member/claims?search=claim');
    expect(fireEvent.click(previous)).toBe(false);
    expect(fireEvent.click(previous, { ctrlKey: true })).toBe(false);

    expect(hoisted.push).toHaveBeenCalledTimes(1);
    expect(hoisted.push).toHaveBeenCalledWith('/member/claims?page=3&search=claim', {
      scroll: false,
    });
    expect(screen.getByTestId('member-claims-page-previous')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
  it('times out only the page navigation that has not committed', () => {
    vi.useFakeTimers();
    try {
      const settled = {
        data: { claims: mockClaims, totalPages: 3, page: 1 },
        isError: false,
        isPlaceholderData: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useQuery>;
      mockUseQuery.mockReturnValue(settled);
      const view = render(<MemberClaimsTable />);
      const next = screen.getByTestId('member-claims-page-next');
      fireEvent.click(next);
      act(() => vi.advanceTimersByTime(10_000));
      expect(next).not.toHaveAttribute('aria-disabled', 'true');

      fireEvent.click(next);
      hoisted.searchParams = new URLSearchParams('page=2');
      mockUseQuery.mockReturnValue({ ...settled, isPlaceholderData: true } as ReturnType<
        typeof useQuery
      >);
      view.rerender(<MemberClaimsTable />);
      act(() => vi.advanceTimersByTime(10_000));
      expect(next).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByText('memberList.updating')).toBeVisible();
      expect(screen.getByTestId('member-claims-pagination-pending')).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });
});
