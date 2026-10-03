import { notifySiblingNavigation } from '@/hooks/use-sibling-navigation-cancel';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentUsersFilters } from './agent-users-filters';

const { pathnameMock, pushMock, searchParamsMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(() => '/agent/clients'),
  pushMock: vi.fn(),
  searchParamsMock: vi.fn(() => new URLSearchParams()),
}));

// Mock router
vi.mock('@/i18n/routing', () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({
    push: pushMock,
  }),
}));

// Mock navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      search: 'Search',
      search_placeholder: 'Search members...',
      search_label: 'Search members',
      processing: 'Processing...',
    };
    return translations[key] || key;
  },
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

// The shared responsive policy commits one navigation per typing burst and
// keeps the input editable while that navigation runs.
const SEARCH_COMMIT_DELAY_MS = 250;

function searchInput(): HTMLInputElement {
  return screen.getByTestId<HTMLInputElement>('agent-clients-search-input');
}

function type(value: string): void {
  fireEvent.change(searchInput(), { target: { value } });
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('AgentUsersFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    pathnameMock.mockReturnValue('/agent/clients');
    searchParamsMock.mockReturnValue(new URLSearchParams());
    window.history.replaceState(null, '', '/agent/clients');
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders search input', () => {
    render(<AgentUsersFilters />);
    expect(screen.getByPlaceholderText('Search members...')).toBeInTheDocument();
  });

  it('renders search input with correct class', () => {
    render(<AgentUsersFilters />);
    const input = screen.getByPlaceholderText('Search members...');
    expect(input).toHaveClass('pl-9');
  });

  it('preserves query context and shows deterministic pending feedback for search navigation', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('tenantId=tenant_ks&view=active'));

    render(<AgentUsersFilters />);

    type('ada');

    advance(SEARCH_COMMIT_DELAY_MS);

    expect(pushMock).toHaveBeenCalledWith(
      '/agent/clients?tenantId=tenant_ks&view=active&search=ada',
      {
        scroll: false,
      }
    );
    expect(screen.getByTestId('agent-clients-search-region')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('agent-clients-search-pending')).toHaveTextContent('Processing...');
    // The owner of this search keeps typing: only the navigation is deferred.
    expect(searchInput()).not.toBeDisabled();
  });

  it('coalesces one typing burst into a single search navigation', () => {
    render(<AgentUsersFilters />);

    for (const value of ['a', 'ad', 'ada']) {
      type(value);
      advance(SEARCH_COMMIT_DELAY_MS - 50);
    }

    expect(pushMock).not.toHaveBeenCalled();

    advance(50);

    expect(pushMock).toHaveBeenCalledExactlyOnceWith('/agent/clients?search=ada', {
      scroll: false,
    });
  });

  it('keeps editing available while its own search navigation is pending', () => {
    render(<AgentUsersFilters />);

    type('ada');
    advance(SEARCH_COMMIT_DELAY_MS);

    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(searchInput()).not.toBeDisabled();

    type('ada lovelace');
    advance(SEARCH_COMMIT_DELAY_MS);

    expect(pushMock).toHaveBeenCalledTimes(2);
    expect(pushMock).toHaveBeenLastCalledWith('/agent/clients?search=ada+lovelace', {
      scroll: false,
    });
  });

  it('keeps the newer draft when an earlier own search echoes back', () => {
    const { rerender } = render(<AgentUsersFilters />);

    type('ada');
    advance(SEARCH_COMMIT_DELAY_MS);
    expect(pushMock).toHaveBeenCalledTimes(1);

    type('ada lovelace');
    // The first commit lands in the url while the newer draft is still queued.
    searchParamsMock.mockReturnValue(new URLSearchParams('search=ada'));
    rerender(<AgentUsersFilters />);

    expect(searchInput().value).toBe('ada lovelace');
    expect(screen.getByTestId('agent-clients-search-pending')).toBeInTheDocument();

    advance(SEARCH_COMMIT_DELAY_MS);

    expect(pushMock).toHaveBeenCalledTimes(2);
    expect(pushMock).toHaveBeenLastCalledWith('/agent/clients?search=ada+lovelace', {
      scroll: false,
    });
  });

  it('drops queued search work when a real sibling navigation starts', () => {
    render(<AgentUsersFilters />);

    type('abandoned');
    advance(100);

    act(() => {
      notifySiblingNavigation('/agent/clients?view=archived');
    });

    advance(SEARCH_COMMIT_DELAY_MS);

    expect(pushMock).not.toHaveBeenCalled();
    // The sibling navigation owns the url until the router adopts it.
    expect(searchInput()).toBeDisabled();
  });

  it('clears search while preserving unrelated query context', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('tenantId=tenant_ks&search=ada'));

    render(<AgentUsersFilters />);

    type('');

    advance(SEARCH_COMMIT_DELAY_MS);

    expect(pushMock).toHaveBeenCalledWith('/agent/clients?tenantId=tenant_ks', {
      scroll: false,
    });
  });

  it('avoids redundant same-query navigation and pending feedback', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('tenantId=tenant_ks&search=ada'));

    render(<AgentUsersFilters />);

    advance(SEARCH_COMMIT_DELAY_MS);

    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('agent-clients-search-region')).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByTestId('agent-clients-search-pending')).not.toBeInTheDocument();

    // Retyping the committed term stays a no-op, including its page context.
    type('ada');
    advance(SEARCH_COMMIT_DELAY_MS);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('does not reset pagination for an agent clients search', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('page=3&tenantId=tenant_ks'));

    render(<AgentUsersFilters />);

    type('ada');
    advance(SEARCH_COMMIT_DELAY_MS);

    expect(pushMock).toHaveBeenCalledExactlyOnceWith(
      '/agent/clients?page=3&tenantId=tenant_ks&search=ada',
      { scroll: false }
    );
  });
});
