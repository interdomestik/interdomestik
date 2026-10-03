import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePathname, useRouter, useSearchParams } from './claims-filters.test-support';
import { SEARCH_COMMIT_DELAY_MS } from '@/hooks/use-responsive-search';
import { AdminClaimsFilters } from './claims-filters';

describe('AdminClaimsFilters automatic search', () => {
  const mockRouter = { replace: vi.fn() };

  const setParams = (qs = '') =>
    vi
      .mocked(useSearchParams)
      .mockReturnValue(new URLSearchParams(qs) as unknown as ReturnType<typeof useSearchParams>);
  const searchInput = () => screen.getByPlaceholderText('Search...');
  const typeSearch = (value: string) => fireEvent.change(searchInput(), { target: { value } });
  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  const claimHref = '/admin/claims/claim-1';
  const SiblingLink = () => <a href={claimHref}>Open claim</a>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue(mockRouter as unknown as ReturnType<typeof useRouter>);
    vi.mocked(usePathname).mockReturnValue('/admin/claims');
    setParams();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('coalesces a typing burst into one trailing navigation at the shared delay', () => {
    render(<AdminClaimsFilters />);

    typeSearch('q');
    typeSearch('qu');
    typeSearch('que');

    advance(SEARCH_COMMIT_DELAY_MS - 1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(searchInput()).toHaveValue('que');

    advance(1);
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/admin/claims?search=que&view=list', {
      scroll: false,
    });
  });

  it('keeps the newer draft through a late echo for the in-flight query', () => {
    const { rerender } = render(<AdminClaimsFilters />);

    typeSearch('a');
    advance(SEARCH_COMMIT_DELAY_MS);
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/admin/claims?search=a&view=list', {
      scroll: false,
    });

    // Edited while A is still in flight, then A's echo lands.
    typeSearch('ab');
    setParams('search=a&view=list');
    rerender(<AdminClaimsFilters />);

    expect(searchInput()).toHaveValue('ab');
    expect(screen.getByTestId('admin-claims-pending')).toHaveTextContent('Updating search...');

    advance(SEARCH_COMMIT_DELAY_MS);
    expect(mockRouter.replace).toHaveBeenCalledTimes(2);
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/admin/claims?search=ab&view=list', {
      scroll: false,
    });

    setParams('search=ab&view=list');
    rerender(<AdminClaimsFilters />);
    expect(searchInput()).toHaveValue('ab');
    expect(screen.queryByTestId('admin-claims-pending')).not.toBeInTheDocument();
  });

  it('preserves unrelated params, drops pagination and forces the list view', () => {
    setParams('status=draft&page=3&view=board&foo=bar');
    render(<AdminClaimsFilters />);

    typeSearch('x');
    advance(SEARCH_COMMIT_DELAY_MS);

    expect(mockRouter.replace).toHaveBeenCalledWith(
      '/admin/claims?status=draft&view=list&foo=bar&search=x',
      { scroll: false }
    );
  });

  it('treats the all sentinel as an empty search term', () => {
    setParams('search=query&view=list');
    render(<AdminClaimsFilters />);

    typeSearch('all');
    advance(SEARCH_COMMIT_DELAY_MS);

    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/admin/claims?view=list', { scroll: false });
    expect(searchInput()).toHaveValue('all');
  });

  it('skips navigation when the sentinel resolves to the committed url', () => {
    setParams('view=list');
    render(<AdminClaimsFilters />);

    typeSearch('all');
    advance(SEARCH_COMMIT_DELAY_MS);

    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(screen.queryByTestId('admin-claims-pending')).not.toBeInTheDocument();
    expect(searchInput()).toHaveValue('all');
  });

  it('drops a queued search when back navigation lands before the echo', () => {
    const { rerender } = render(<AdminClaimsFilters />);

    typeSearch('q');
    setParams('status=draft&view=list');
    rerender(<AdminClaimsFilters />);
    advance(SEARCH_COMMIT_DELAY_MS);

    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(searchInput()).toHaveValue('');
    expect(screen.queryByTestId('admin-claims-pending')).not.toBeInTheDocument();
  });

  it('cancels a queued search when a real sibling link is clicked', () => {
    render(
      <>
        <AdminClaimsFilters />
        <SiblingLink />
      </>
    );

    typeSearch('q');
    fireEvent.click(screen.getByText('Open claim'));
    advance(SEARCH_COMMIT_DELAY_MS);

    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('admin-claims-pending')).toHaveTextContent('Updating filters...');
  });

  it('keeps the queued search for a modified click and for a pending-disabled tab', () => {
    render(
      <>
        <AdminClaimsFilters />
        <SiblingLink />
      </>
    );

    typeSearch('q');
    fireEvent.click(screen.getByText('Open claim'), { metaKey: true });
    // Tabs are aria-disabled while search is pending: no navigation, no cancel.
    fireEvent.click(screen.getByTestId('claims-tab-draft'));
    advance(SEARCH_COMMIT_DELAY_MS);

    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/admin/claims?search=q&view=list', {
      scroll: false,
    });
  });

  it('drops a queued search on unmount', () => {
    const { unmount } = render(<AdminClaimsFilters />);

    typeSearch('q');
    unmount();
    advance(SEARCH_COMMIT_DELAY_MS);

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
