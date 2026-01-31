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
  useTranslations: () => (key: string) => {
    if (key === 'all') return 'All';
    if (key === 'search') return 'Search';
    return key; // Fallback to key for `sections.*`
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
  const mockRouter = { push: vi.fn() };
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

    expect(screen.getByText('sections.active')).toBeInTheDocument();
    expect(screen.getByText('sections.draft')).toBeInTheDocument();
    expect(screen.getByText('sections.resolved')).toBeInTheDocument();
    expect(screen.getAllByText('All').length).toBeGreaterThan(0);
  });

  it('updates url on status change', () => {
    render(<AdminClaimsFilters />);

    const draftTab = screen.getByText('sections.draft');
    fireEvent.click(draftTab);

    expect(mockRouter.push).toHaveBeenCalledWith(expect.stringContaining('status=draft'));
  });

  it('removes status param when clicking All', () => {
    (useSearchParams as any).mockReturnValue(createMockParams('status=active'));
    render(<AdminClaimsFilters />);

    // Get the status 'All' tab (last one in the status group)
    const statusAllTab = screen.getByTestId('status-filter-all');
    fireEvent.click(statusAllTab);

    // Should push URL without status param
    // The previous implementation constructs a string, if 'all' removes status, it might be just '?' or similar.
    // Let's assert it DOES NOT contain 'status=all' or 'status=active'
    const pushCall = mockRouter.push.mock.calls[0][0];
    expect(pushCall).not.toContain('status=');
  });

  it('updates url on search', () => {
    render(<AdminClaimsFilters />);

    const input = screen.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: 'query' } });

    expect(mockRouter.push).toHaveBeenCalledWith(expect.stringContaining('search=query'));
  });
});
