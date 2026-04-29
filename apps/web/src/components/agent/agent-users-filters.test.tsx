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

describe('AgentUsersFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    pathnameMock.mockReturnValue('/agent/clients');
    searchParamsMock.mockReturnValue(new URLSearchParams());
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

    fireEvent.change(screen.getByTestId('agent-clients-search-input'), {
      target: { value: 'ada' },
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(pushMock).toHaveBeenCalledWith(
      '/agent/clients?tenantId=tenant_ks&view=active&search=ada',
      {
        scroll: false,
      }
    );
    expect(screen.getByTestId('agent-clients-search-region')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('agent-clients-search-pending')).toHaveTextContent('Processing...');
    expect(screen.getByTestId('agent-clients-search-input')).toBeDisabled();
  });

  it('keeps the active search control inert while a search transition is pending', () => {
    render(<AgentUsersFilters />);

    fireEvent.change(screen.getByTestId('agent-clients-search-input'), {
      target: { value: 'ada' },
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByTestId('agent-clients-search-input')).toBeDisabled();

    fireEvent.change(screen.getByTestId('agent-clients-search-input'), {
      target: { value: 'ada lovelace' },
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it('clears search while preserving unrelated query context', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('tenantId=tenant_ks&search=ada'));

    render(<AgentUsersFilters />);

    fireEvent.change(screen.getByTestId('agent-clients-search-input'), {
      target: { value: '' },
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(pushMock).toHaveBeenCalledWith('/agent/clients?tenantId=tenant_ks', {
      scroll: false,
    });
  });

  it('avoids redundant same-query navigation and pending feedback', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('tenantId=tenant_ks&search=ada'));

    render(<AgentUsersFilters />);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('agent-clients-search-region')).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByTestId('agent-clients-search-pending')).not.toBeInTheDocument();
  });
});
