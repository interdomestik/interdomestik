import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPS_TEST_IDS } from '@/components/ops/testids';
import { AdminClaimsFilters } from './claims-filters';

// Mock next/navigation - the component imports useRouter, usePathname, useSearchParams from here
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    if (namespace === 'common') {
      if (key === 'all') return 'All';
      if (key === 'search') return 'Search';
    }

    const adminClaimsKeys: Record<string, string> = {
      'sections.active': 'Active',
      'sections.draft': 'Draft',
      'sections.resolved': 'Closed',
      'filters.unassigned_only': 'Unassigned',
      'filters.assigned_to_me': 'Assigned to me',
      'filters.assignment_label': 'Assignment',
      'filters.origin_label': 'Origin',
      'filters.origin_all': 'All origins',
      'filters.origin_diaspora': 'Diaspora / Green Card',
      'filters.pending_filter': 'Updating filters...',
      'filters.pending_search': 'Updating search...',
    };

    return adminClaimsKeys[key] ?? key;
  },
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Button: ({
    children,
    asChild: _asChild,
    ...props
  }: PropsWithChildren<ComponentProps<'button'> & { asChild?: boolean }>) => (
    <button {...props}>{children}</button>
  ),
  Badge: ({ children, ...props }: PropsWithChildren<ComponentProps<'span'>>) => (
    <span {...props}>{children}</span>
  ),
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
  // GlassCard is just a div in test
}));
vi.mock('@/components/ui/glass-card', () => ({
  GlassCard: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

describe('AdminClaimsFilters', () => {
  const mockRouter = { replace: vi.fn() };
  // Helper to create mocked params
  const createMockParams = (qs = '') =>
    new URLSearchParams(qs) as unknown as ReturnType<typeof useSearchParams>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue(mockRouter as unknown as ReturnType<typeof useRouter>);
    vi.mocked(usePathname).mockReturnValue('/admin/claims');
    vi.mocked(useSearchParams).mockReturnValue(createMockParams());
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

  it('keeps replacing the latest search query while search feedback is pending', () => {
    render(<AdminClaimsFilters />);

    const input = screen.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: 'q' } });
    fireEvent.change(input, { target: { value: 'query' } });

    expect(mockRouter.replace).toHaveBeenCalledTimes(2);
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
