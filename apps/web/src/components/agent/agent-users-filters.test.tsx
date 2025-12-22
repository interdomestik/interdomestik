import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentUsersFilters } from './agent-users-filters';

// Mock router
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      search: 'Search',
      search_placeholder: 'Search members...',
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
});
