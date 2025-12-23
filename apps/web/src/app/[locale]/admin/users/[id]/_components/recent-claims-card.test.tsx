import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RecentClaimsCard } from './recent-claims-card';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('./utils', () => ({
  formatDate: () => '2025-12-22',
}));

// Mock Link
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock ClaimStatusBadge
vi.mock('@/components/dashboard/claims/claim-status-badge', () => ({
  ClaimStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

describe('RecentClaimsCard', () => {
  const mockClaims = [
    {
      id: 'c1',
      title: 'Claim 1',
      status: 'submitted',
      claimAmount: '100',
      currency: 'EUR',
      createdAt: new Date(),
    },
  ];

  it('renders claims list', async () => {
    const jsx = await RecentClaimsCard({ recentClaims: mockClaims });
    render(jsx);

    expect(screen.getByText('sections.recent_claims')).toBeInTheDocument();
    expect(screen.getByText('Claim 1')).toBeInTheDocument();
    expect(screen.getByText('100 EUR')).toBeInTheDocument();
  });

  it('renders empty state', async () => {
    const jsx = await RecentClaimsCard({ recentClaims: [] });
    render(jsx);

    expect(screen.getByText('labels.no_claims')).toBeInTheDocument();
  });
});
