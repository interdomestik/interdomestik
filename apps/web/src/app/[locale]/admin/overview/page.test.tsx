import mkAdminDashboard from '@/messages/mk/admin-dashboard.json';
import mkClaims from '@/messages/mk/claims.json';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AdminOverviewPage from './page';

function getTranslationValue(source: unknown, key: string): string {
  const value = key.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, source);

  return typeof value === 'string' ? value : key;
}

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers()),
  getSessionMock: vi.fn(async () => ({
    user: {
      role: 'admin',
      tenantId: 'tenant_mk',
    },
  })),
  getAdminOverviewDataMock: vi.fn(async () => ({
    kpis: {
      totalMembers: 5,
      totalAgents: 4,
      totalActiveClaims: 2,
      claimsUpdatedLast24h: 2,
    },
    claimsByStage: [{ stage: 'submitted', count: 2 }],
    claimsByBranch: [{ branchId: 'mk_branch_a', branchName: 'MK Branch A (Main)', count: 2 }],
  })),
  setRequestLocaleMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('@/features/admin/overview/server/get-admin-overview-data', () => ({
  getAdminOverviewData: hoisted.getAdminOverviewDataMock,
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => null),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (options?: { locale?: 'mk'; namespace?: string } | string) => {
    const namespace = typeof options === 'string' ? options : options?.namespace;

    switch (namespace) {
      case 'admin.dashboardOverview':
        return (key: string) => getTranslationValue(mkAdminDashboard.admin.dashboardOverview, key);
      case 'claims.stage':
        return (key: string) => getTranslationValue(mkClaims.claims.stage, key);
      default:
        return (key: string) => key;
    }
  },
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

describe('AdminOverviewPage', () => {
  it('renders Macedonian copy for the MK locale route', async () => {
    const tree = await AdminOverviewPage({
      params: Promise.resolve({ locale: 'mk' }),
    });

    render(tree);

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('mk');
    expect(screen.getByText('Админ преглед')).toBeInTheDocument();
    expect(screen.getByText('Системско здравје и оперативна акумулација.')).toBeInTheDocument();
    expect(screen.getByText('Вкупно членови')).toBeInTheDocument();
    expect(screen.getByText('Поднесено')).toBeInTheDocument();
    expect(screen.getByText('Барања по фаза')).toBeInTheDocument();
    expect(screen.getByText('Барања по филијала')).toBeInTheDocument();
  });
});
