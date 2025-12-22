import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentClaimsFilters } from './agent-claims-filters';

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
      all: 'All',
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
  Badge: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLSpanElement> & { children: React.ReactNode; variant?: string }) => (
    <span {...props}>{children}</span>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

describe('AgentClaimsFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders search input', () => {
    render(<AgentClaimsFilters />);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('renders all status filter badges', () => {
    render(<AgentClaimsFilters />);

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
    render(<AgentClaimsFilters />);

    // All + 8 statuses = 9 badges
    const badges = screen.getAllByText(
      /All|Draft|Submitted|Verification|Evaluation|Negotiation|Court|Resolved|Rejected/
    );
    expect(badges.length).toBe(9);
  });
});
