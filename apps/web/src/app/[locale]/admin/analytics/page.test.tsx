import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  setRequestLocaleMock: vi.fn(),
  getSessionMock: vi.fn(async () => ({
    user: { tenantId: 'tenant-1', role: 'admin' },
  })),
  getAdminAnalyticsDataCoreMock: vi.fn(async () => ({
    totals: { count: 0, sum: 0, avg: 0 },
    statusDistribution: [],
    categoryDistribution: [],
    activeClaimants: 0,
    successRate: 0,
  })),
  analyticsDashboardMock: vi.fn(() => null),
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('./_core', () => ({
  getAdminAnalyticsDataCore: hoisted.getAdminAnalyticsDataCoreMock,
}));

vi.mock('./_components/AnalyticsDashboard', () => ({
  AnalyticsDashboard: hoisted.analyticsDashboardMock,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

import AdminAnalyticsPage from './page';

describe('AdminAnalyticsPage', () => {
  it('sets the request locale before loading analytics data', async () => {
    const view = await AdminAnalyticsPage({
      params: Promise.resolve({ locale: 'sr' }),
    });
    renderToStaticMarkup(view);

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('sr');
    expect(hoisted.getSessionMock).toHaveBeenCalledTimes(1);
    expect(hoisted.setRequestLocaleMock.mock.invocationCallOrder[0]).toBeLessThan(
      hoisted.getSessionMock.mock.invocationCallOrder[0]
    );
    expect(hoisted.analyticsDashboardMock).toHaveBeenCalledTimes(1);
  });
});
