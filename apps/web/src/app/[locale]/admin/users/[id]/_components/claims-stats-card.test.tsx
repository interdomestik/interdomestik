import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClaimsStatsCard } from './claims-stats-card';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

describe('ClaimsStatsCard', () => {
  it('renders stats counts', async () => {
    const counts = { total: 10, open: 5, resolved: 3, rejected: 2 };
    const jsx = await ClaimsStatsCard({ counts });
    render(jsx);

    expect(screen.getByText('sections.claims_overview')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
