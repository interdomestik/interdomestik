import { useQuery } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberClaimsTable } from './member-claims-table';
import { mockClaims, navigation, resetUnitNavigation } from './member-claims-table-test-support';

const loadMocks = vi.hoisted(() => () => import('./member-claims-table-test-support'));
vi.mock('@tanstack/react-query', async original => (await loadMocks()).reactQueryMock(original));
vi.mock('next/navigation', async () => (await loadMocks()).unitNextNavigationMock());
vi.mock('next-intl', async () => (await loadMocks()).intlMock());
vi.mock('@/i18n/routing', async () => (await loadMocks()).routingMock());
vi.mock('./claim-status-badge', async () => (await loadMocks()).claimStatusBadgeMock());
vi.mock('@/lib/api/claims', async () => (await loadMocks()).claimsApiMock());

const hoisted = navigation;
const mockUseQuery = vi.mocked(useQuery);

describe('MemberClaimsTable', () => {
  beforeEach(resetUnitNavigation);

  it('shows deterministic pending feedback when pagination changes page', () => {
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

  it('keeps current and pending pagination controls inert', () => {
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
