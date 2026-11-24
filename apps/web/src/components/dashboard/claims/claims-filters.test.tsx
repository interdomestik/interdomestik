import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
      'memberList.searchPlaceholder': 'Search...',
      'table.status': 'Status',
      draft: 'Draft',
      submitted: 'Submitted',
      submitted_to_airline: 'Submitted to airline',
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
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

// Mirrors SEARCH_COMMIT_DELAY_MS in use-member-claims-search.ts: search
// navigation is trailing-coalesced, local input edits stay immediate.
const SEARCH_COMMIT_DELAY_MS = 250;

function settleSearchCommit() {
  act(() => {
    vi.advanceTimersByTime(SEARCH_COMMIT_DELAY_MS);
  });
}

describe('ClaimsFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    hoisted.searchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders search input', () => {
    render(<ClaimsFilters />);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search' })).toBe(
      screen.getByTestId('member-claims-search-input')
    );
    expect(screen.getByText('Search', { selector: 'label' })).toBeVisible();
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

  it('renders all ten status options as a named group of pressed-state buttons', () => {
    render(<ClaimsFilters />);

    const group = within(screen.getByRole('group', { name: 'Status' }));
    expect(group.getAllByRole('button', { pressed: true })).toEqual([
      group.getByRole('button', { name: 'All' }),
    ]);
    expect(
      group.getAllByRole('button', { pressed: false }).map(button => button.textContent)
    ).toEqual([
      'Draft',
      'Submitted',
      'Submitted to airline',
      'Verification',
      'Evaluation',
      'Negotiation',
      'Court',
      'Resolved',
      'Rejected',
    ]);
  });

  it('shows pending feedback and updates the url when search changes', () => {
    render(<ClaimsFilters />);

    fireEvent.change(screen.getByTestId('member-claims-search-input'), {
      target: { value: 'claim 42' },
    });

    expect(screen.getByTestId('member-claims-pending')).toHaveTextContent('Processing...');
    expect(hoisted.push).not.toHaveBeenCalled();

    settleSearchCommit();

    expect(hoisted.push).toHaveBeenCalledWith('/member/claims?search=claim+42', {
      scroll: false,
    });
    expect(screen.getByTestId('member-claims-filter-region')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('member-claims-pending')).toHaveTextContent('Processing...');
  });

  it('keeps a literal all search term instead of treating it as a status sentinel', () => {
    render(<ClaimsFilters />);

    fireEvent.change(screen.getByTestId('member-claims-search-input'), {
      target: { value: 'all' },
    });

    settleSearchCommit();

    expect(hoisted.push).toHaveBeenCalledWith('/member/claims?search=all', {
      scroll: false,
    });
  });

  it('does not show pending feedback for a same-query search change', () => {
    hoisted.searchParams = new URLSearchParams('search=claim+42');

    render(<ClaimsFilters />);

    fireEvent.change(screen.getByTestId('member-claims-search-input'), {
      target: { value: 'claim 42' },
    });

    settleSearchCommit();

    expect(hoisted.push).not.toHaveBeenCalled();
    expect(screen.queryByTestId('member-claims-pending')).not.toBeInTheDocument();
    expect(screen.getByTestId('member-claims-filter-region')).toHaveAttribute('aria-busy', 'false');
  });

  it('keeps the active status filter inert and starts pending feedback for a new status', () => {
    hoisted.searchParams = new URLSearchParams('status=submitted&search=claim');

    render(<ClaimsFilters />);

    const activeStatus = screen.getByTestId('member-claims-status-filter-submitted');
    expect(activeStatus).toHaveAttribute('aria-disabled', 'true');
    expect(activeStatus).not.toBeDisabled();
    expect(activeStatus.querySelector('[aria-hidden="true"]')).toBeVisible();
    expect(activeStatus).toHaveClass('bg-[hsl(var(--primary))]', 'border');
    fireEvent.click(activeStatus);
    expect(hoisted.push).not.toHaveBeenCalled();

    const draft = screen.getByTestId('member-claims-status-filter-draft');
    draft.focus();
    fireEvent.click(draft);
    expect(draft).toHaveFocus();
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox')).not.toBeDisabled();
    // <output> carries the implicit status role (Sonar S6819); it must be the one status node.
    expect(screen.getByRole('status')).toBe(screen.getByTestId('member-claims-pending'));
    expect(screen.getByTestId('member-claims-pending')).toBeInstanceOf(HTMLOutputElement);
    expect(screen.getByTestId('member-claims-pending')).not.toHaveAttribute('aria-live');

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
