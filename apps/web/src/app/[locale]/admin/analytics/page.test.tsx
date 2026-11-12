import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminSidebarItems } from '@/components/admin/admin-sidebar-items';
import { resolveAdminNavigationCapabilities } from '@/features/admin/access/admin-navigation-capabilities.server';

const hoisted = vi.hoisted(() => ({
  setRequestLocaleMock: vi.fn(),
  getSessionMock: vi.fn(),
  hasPortalAccess: vi.fn(),
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
vi.mock('@/server/auth/effective-portal-access', () => ({
  hasEffectivePortalAccess: hoisted.hasPortalAccess,
}));

vi.mock('./_core', () => ({
  getAdminAnalyticsDataCore: hoisted.getAdminAnalyticsDataCoreMock,
}));

vi.mock('./_components/AnalyticsDashboard', () => ({
  AnalyticsDashboard: hoisted.analyticsDashboardMock,
}));

vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('LOGIN');
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

import AdminAnalyticsPage from './page';

describe('AdminAnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.hasPortalAccess.mockResolvedValue(false);
    hoisted.getSessionMock.mockResolvedValue({
      user: { id: 'admin-1', tenantId: 'tenant-1', role: 'admin' },
    });
  });

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
    expect(hoisted.getAdminAnalyticsDataCoreMock).toHaveBeenCalledWith(expect.any(Object));
    expect(hoisted.analyticsDashboardMock).toHaveBeenCalledTimes(1);
  });

  it.each(['super_admin', 'tenant_admin', 'admin', 'branch_manager'])(
    'admits %s consistently with navigation',
    async role => {
      const session = {
        user: { id: 'u1', tenantId: 'tenant-1', role, branchId: 'branch-a' },
      };
      hoisted.getSessionMock.mockResolvedValue(session);
      hoisted.hasPortalAccess.mockResolvedValue(role !== 'branch_manager');
      renderToStaticMarkup(await AdminAnalyticsPage({ params: Promise.resolve({ locale: 'sq' }) }));
      expect(hoisted.getAdminAnalyticsDataCoreMock).toHaveBeenCalledOnce();
      expect(
        adminSidebarItems(role, 'branch-a', await resolveAdminNavigationCapabilities(session)).some(
          item => item.href === '/admin/analytics'
        )
      ).toBe(true);
    }
  );

  it.each([
    ['branch_manager', null],
    ['branch_manager', ''],
    ['branch_manager', '   '],
    ['staff', 'branch-a'],
    ['agent', 'branch-a'],
    ['member', 'branch-a'],
    ['unknown', 'branch-a'],
  ])('refuses role %s with branch %j before loading analytics', async (role, branchId) => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { id: 'u1', tenantId: 'tenant-1', role, branchId },
    });
    await expect(AdminAnalyticsPage({ params: Promise.resolve({ locale: 'sq' }) })).rejects.toThrow(
      'NOT_FOUND'
    );
    expect(hoisted.getAdminAnalyticsDataCoreMock).not.toHaveBeenCalled();
    const capabilities = await resolveAdminNavigationCapabilities(await hoisted.getSessionMock());
    expect(
      adminSidebarItems(role!, branchId, capabilities).some(
        item => item.href === '/admin/analytics'
      )
    ).toBe(false);
  });

  it('requires authentication before loading analytics', async () => {
    hoisted.getSessionMock.mockResolvedValue(null);
    await expect(AdminAnalyticsPage({ params: Promise.resolve({ locale: 'sq' }) })).rejects.toThrow(
      'LOGIN'
    );
    expect(hoisted.getAdminAnalyticsDataCoreMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the authority denies analytics access', async () => {
    hoisted.getAdminAnalyticsDataCoreMock.mockRejectedValueOnce(new Error('Unauthorized'));
    await expect(AdminAnalyticsPage({ params: Promise.resolve({ locale: 'sq' }) })).rejects.toThrow(
      'NOT_FOUND'
    );
  });

  it.each(['staff', 'agent'])(
    'preserves direct analytics access for %s with an explicit admin grant',
    async role => {
      const session = { user: { id: 'u1', role, tenantId: 'tenant-1' } };
      hoisted.getSessionMock.mockResolvedValue(session);
      hoisted.hasPortalAccess.mockResolvedValue(true);
      renderToStaticMarkup(await AdminAnalyticsPage({ params: Promise.resolve({ locale: 'sq' }) }));
      expect(hoisted.getAdminAnalyticsDataCoreMock).toHaveBeenCalledOnce();
      const capabilities = await resolveAdminNavigationCapabilities(session);
      expect(adminSidebarItems(role, null, capabilities).map(item => item.href)).toContain(
        '/admin/analytics'
      );
    }
  );
});
