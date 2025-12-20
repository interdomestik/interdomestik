import type { DashboardStats } from '@/actions/admin-dashboard';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminStatsCards } from '../admin-stats-cards';

// Mock next-intl
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => {
    const t = (key: string) => {
      const messages: Record<string, string> = {
        total: 'Total Claims',
        new: 'New Claims',
        closed: 'Resolved Claims',
      };
      return messages[key] || key;
    };
    return t;
  }),
}));

describe('AdminStatsCards', () => {
  const mockStats: DashboardStats = {
    totalClaims: 100,
    newClaims: 10,
    resolvedClaims: 80,
    totalUsers: 50,
    totalClaimVolume: 50000,
  };

  it('renders all stat cards with correct values', async () => {
    const Component = await AdminStatsCards({ stats: mockStats });
    render(Component);

    expect(screen.getByText('Total Claims')).toBeDefined();
    expect(screen.getByText('100')).toBeDefined();

    expect(screen.getByText('New Claims')).toBeDefined();
    expect(screen.getByText('10')).toBeDefined();

    expect(screen.getByText('Resolved Claims')).toBeDefined();
    expect(screen.getByText('80')).toBeDefined();

    expect(screen.getByText('Active Members')).toBeDefined();
    expect(screen.getByText('50')).toBeDefined();
  });
});
