import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimsFilters } from './claims-filters';

const hoisted = vi.hoisted(() => ({
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

// Mock router
vi.mock('@/i18n/routing', () => ({
  usePathname: () => '/member/claims',
  useRouter: () => ({
    push: hoisted.push,
  }),
}));

// Mock navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => hoisted.searchParams,
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      all: 'All',
      processing: 'Processing...',
      search: 'Search',
      draft: 'Draft',
      submitted: 'Submitted',
      verification: 'Verification',
      evaluation: 'Evaluation',
      negotiation: 'Negotiation',
      court: 'Court',
      resolved: 'Resolved',
      rejected: 'Rejected',
    };
    return translations[key] || key;
  },
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  badgeVariants: () => 'badge',
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

describe('ClaimsFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.searchParams = new URLSearchParams();
  });

  it('renders search input', () => {
    render(<ClaimsFilters />);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('renders all status filter badges', () => {
    render(<ClaimsFilters />);

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('Verification')).toBeInTheDocument();
    expect(screen.getByText('Evaluation')).toBeInTheDocument();
    expect(screen.getByText('Negotiation')).toBeInTheDocument();
    expect(screen.getByText('Court')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('renders 9 status options', () => {
    render(<ClaimsFilters />);

    // All + 8 statuses = 9 badges
    const badges = screen.getAllByText(
      /All|Draft|Submitted|Verification|Evaluation|Negotiation|Court|Resolved|Rejected/
    );
    expect(badges.length).toBe(9);
  });

  it('shows pending feedback and updates the url when search changes', () => {
    render(<ClaimsFilters />);

    fireEvent.change(screen.getByTestId('member-claims-search-input'), {
      target: { value: 'claim 42' },
    });

    expect(hoisted.push).toHaveBeenCalledWith('/member/claims?search=claim+42', {
      scroll: false,
    });
    expect(screen.getByTestId('member-claims-filter-region')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('member-claims-pending')).toHaveTextContent('Processing...');
  });

  it('does not show pending feedback for a same-query search change', () => {
    hoisted.searchParams = new URLSearchParams('search=claim+42');

    render(<ClaimsFilters />);

    fireEvent.change(screen.getByTestId('member-claims-search-input'), {
      target: { value: 'claim 42' },
    });

    expect(hoisted.push).not.toHaveBeenCalled();
    expect(screen.queryByTestId('member-claims-pending')).not.toBeInTheDocument();
    expect(screen.getByTestId('member-claims-filter-region')).toHaveAttribute('aria-busy', 'false');
  });

  it('keeps the active status filter inert and starts pending feedback for a new status', () => {
    hoisted.searchParams = new URLSearchParams('status=submitted&search=claim');

    render(<ClaimsFilters />);

    const activeStatus = screen.getByTestId('member-claims-status-filter-submitted');
    expect(activeStatus).toBeDisabled();
    fireEvent.click(activeStatus);
    expect(hoisted.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('member-claims-status-filter-draft'));

    expect(hoisted.push).toHaveBeenCalledWith('/member/claims?status=draft&search=claim', {
      scroll: false,
    });
    expect(screen.getByTestId('member-claims-pending')).toHaveTextContent('Processing...');
  });

  it('blocks overlapping filter navigation while a status update is pending', () => {
    render(<ClaimsFilters />);

    fireEvent.click(screen.getByTestId('member-claims-status-filter-draft'));
    fireEvent.click(screen.getByTestId('member-claims-status-filter-submitted'));

    expect(hoisted.push).toHaveBeenCalledTimes(1);
    expect(hoisted.push).toHaveBeenCalledWith('/member/claims?status=draft', {
      scroll: false,
    });
  });
});
