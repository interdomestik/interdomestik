import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
      'filters.origin_label': 'Origin',
      'filters.origin_all': 'All origins',
      'filters.origin_diaspora': 'Diaspora / Green Card',
    };

    return adminClaimsKeys[key] ?? key;
  },
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  Input: (props: any) => <input {...props} />,
  // GlassCard is just a div in test
}));
vi.mock('@/components/ui/glass-card', () => ({
  GlassCard: ({ children }: any) => <div>{children}</div>,
}));

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

describe('AdminClaimsFilters', () => {
  const mockRouter = { replace: vi.fn() };
  // Helper to create mocked params
  const createMockParams = (qs = '') => new URLSearchParams(qs);

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue(mockRouter);
    (usePathname as any).mockReturnValue('/admin/claims');
    (useSearchParams as any).mockReturnValue(createMockParams());
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
    (useSearchParams as any).mockReturnValue(createMockParams('status=active'));
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
});
