import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimDetailHeader } from './claim-detail-header';

// Mock routing
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      back: 'Back',
      vehicle: 'Vehicle',
      travel: 'Travel',
      property: 'Property',
      other: 'Other',
    };
    return translations[key] || key;
  },
}));

// Mock date-fns
vi.mock('date-fns', () => ({
  format: () => 'Jan 15, 2024 10:00 AM',
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <button {...props}>{children}</button>,
}));

const mockClaim = {
  id: 'claim-123',
  title: 'Car Accident Claim',
  category: 'vehicle',
  createdAt: '2024-01-15T10:00:00Z',
};

describe('ClaimDetailHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders claim title', () => {
    render(<ClaimDetailHeader claim={mockClaim} />);
    expect(screen.getByText('Car Accident Claim')).toBeInTheDocument();
  });

  it('renders back button', () => {
    render(<ClaimDetailHeader claim={mockClaim} />);
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  it('renders category badge', () => {
    render(<ClaimDetailHeader claim={mockClaim} />);
    expect(screen.getByText('Vehicle')).toBeInTheDocument();
  });

  it('renders claim ID', () => {
    render(<ClaimDetailHeader claim={mockClaim} />);
    expect(screen.getByText(/ID: claim-123/)).toBeInTheDocument();
  });

  it('renders formatted date', () => {
    render(<ClaimDetailHeader claim={mockClaim} />);
    expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument();
  });

  it('back link points to claims list', () => {
    render(<ClaimDetailHeader claim={mockClaim} />);
    const backLink = screen.getByText('Back').closest('a');
    expect(backLink).toHaveAttribute('href', '/agent/claims');
  });
});
