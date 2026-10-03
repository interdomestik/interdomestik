import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OPS_TEST_IDS } from '@/components/ops/testids';
import { usePathname, useRouter, useSearchParams } from './claims-filters.test-support';
import { SEARCH_COMMIT_DELAY_MS } from '@/hooks/use-responsive-search';
import { AdminClaimsFilters } from './claims-filters';

describe('AdminClaimsFilters', () => {
  const mockRouter = { replace: vi.fn() };
  // Helper to create mocked params
  const createMockParams = (qs = '') =>
    new URLSearchParams(qs) as unknown as ReturnType<typeof useSearchParams>;
  // Automatic search is coalesced: the navigation lands on the trailing edge.
  const flushSearchCommit = () =>
    act(() => {
      vi.advanceTimersByTime(SEARCH_COMMIT_DELAY_MS);
    });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue(mockRouter as unknown as ReturnType<typeof useRouter>);
    vi.mocked(usePathname).mockReturnValue('/admin/claims');
    vi.mocked(useSearchParams).mockReturnValue(createMockParams());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders search input', () => {
    render(<AdminClaimsFilters />);
    // Template: `${t('search')}...` -> 'Search...'
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('renders V2 business group tabs', () => {
    render(<AdminClaimsFilters />);

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getAllByText('All').length).toBeGreaterThan(0);
  });

  it('renders diaspora filter controls and updates the url when selected', () => {
    render(<AdminClaimsFilters />);

    const diasporaButton = screen.getByTestId('diaspora-filter-diaspora');
    fireEvent.click(diasporaButton);

    expect(mockRouter.replace).toHaveBeenCalledWith(expect.stringContaining('diaspora=diaspora'), {
      scroll: false,
    });
  });

  it('removes status param when clicking All', () => {
    vi.mocked(useSearchParams).mockReturnValue(createMockParams('status=active'));
    render(<AdminClaimsFilters />);

    const statusAllTab = screen.getByTestId('claims-tab-all');
    expect(statusAllTab).toHaveAttribute('href', '?view=list');
  });

  it('updates url on search', () => {
    render(<AdminClaimsFilters />);

    const input = screen.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: 'query' } });
    flushSearchCommit();

    expect(mockRouter.replace).toHaveBeenCalledWith(expect.stringContaining('search=query'), {
      scroll: false,
    });
  });

  it('shows deterministic pending feedback when search updates the url', () => {
    render(<AdminClaimsFilters />);

    const input = screen.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: 'query' } });

    expect(screen.getByTestId('admin-claims-filter-region')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('admin-claims-pending')).toHaveTextContent('Updating search...');
    expect(input).toHaveValue('query');
  });

  it('commits only the latest search query once per burst', () => {
    render(<AdminClaimsFilters />);

    const input = screen.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: 'q' } });
    fireEvent.change(input, { target: { value: 'query' } });
    flushSearchCommit();

    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/admin/claims?search=query&view=list', {
      scroll: false,
    });
    expect(input).toHaveValue('query');
  });

  it('does not show pending feedback when search would keep the same url', () => {
    vi.mocked(useSearchParams).mockReturnValue(createMockParams('search=query&view=list'));
    render(<AdminClaimsFilters />);

    const input = screen.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: 'query' } });
    flushSearchCommit();

    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(screen.queryByTestId('admin-claims-pending')).not.toBeInTheDocument();
    expect(screen.getByTestId('admin-claims-filter-region')).toHaveAttribute('aria-busy', 'false');
  });

  it('routes status tabs through the pending contract and keeps the active tab inert', () => {
    vi.mocked(useSearchParams).mockReturnValue(createMockParams('status=active'));
    render(<AdminClaimsFilters />);

    fireEvent.click(screen.getByTestId('claims-tab-active'));
    expect(mockRouter.replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('claims-tab-draft'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/admin/claims?status=draft&view=list', {
      scroll: false,
    });
    expect(screen.getByTestId('admin-claims-pending')).toHaveTextContent('Updating filters...');
  });

  it('blocks overlapping filter navigation while a filter update is pending', () => {
    render(<AdminClaimsFilters />);

    fireEvent.click(screen.getByTestId('assigned-filter-unassigned'));
    fireEvent.click(screen.getByTestId('diaspora-filter-diaspora'));

    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/admin/claims?assigned=unassigned&view=list', {
      scroll: false,
    });
  });

  it('makes search inert while a filter update is pending', () => {
    render(<AdminClaimsFilters />);

    fireEvent.click(screen.getByTestId('assigned-filter-unassigned'));

    expect(screen.getByPlaceholderText('Search...')).toBeDisabled();
  });

  it('labels assignment controls and preserves wrapping classes for filter groups', () => {
    render(<AdminClaimsFilters />);

    expect(screen.getByTestId(OPS_TEST_IDS.FILTERS.ACTIONS)).toHaveClass('flex-wrap');
    expect(screen.getByRole('group', { name: 'Assignment' })).toHaveClass('flex-wrap');
    expect(screen.getByRole('group', { name: 'Origin' })).toHaveClass('flex-wrap');
  });
});
