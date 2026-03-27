import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  setRequestLocaleMock: vi.fn(),
  getTranslationsMock: vi.fn(
    async () => (key: string) =>
      (
        ({
          title: 'Localized Overview',
          description: 'Localized description',
          kpis_total_members: 'Localized Members',
          kpis_total_agents: 'Localized Agents',
          kpis_total_active_claims: 'Localized Active Claims',
          kpis_claims_updated_24h: 'Localized Updated Claims',
          claims_by_stage: 'Localized Claims by Stage',
          claims_by_branch: 'Localized Claims by Branch',
          no_active_claims: 'Localized empty claims',
          no_branch_accumulation: 'Localized empty branches',
        }) as const
      )[key] ?? key
  ),
  getSessionSafeMock: vi.fn(async () => ({
    user: { role: 'admin', tenantId: 'tenant-1' },
  })),
  getAdminOverviewDataMock: vi.fn(async () => ({
    kpis: {
      totalMembers: 12,
      totalAgents: 4,
      totalActiveClaims: 3,
      claimsUpdatedLast24h: 2,
    },
    claimsByStage: [],
    claimsByBranch: [],
  })),
  notFoundMock: vi.fn(() => null),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: hoisted.getTranslationsMock,
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionSafeMock,
}));

vi.mock('@/features/admin/overview/server/get-admin-overview-data', () => ({
  getAdminOverviewData: hoisted.getAdminOverviewDataMock,
}));

vi.mock('next/navigation', () => ({
  notFound: hoisted.notFoundMock,
}));

import AdminOverviewPage from './page';

describe('AdminOverviewPage', () => {
  it('sets the request locale before loading translations and renders localized copy', async () => {
    const view = await AdminOverviewPage({
      params: Promise.resolve({ locale: 'mk' }),
    });

    const markup = renderToStaticMarkup(view);

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('mk');
    expect(hoisted.getTranslationsMock).toHaveBeenCalledWith('admin.overview_page');
    expect(hoisted.setRequestLocaleMock.mock.invocationCallOrder[0]).toBeLessThan(
      hoisted.getTranslationsMock.mock.invocationCallOrder[0]
    );
    expect(markup).toContain('Localized Overview');
    expect(markup).toContain('Localized description');
    expect(markup).toContain('Localized Members');
    expect(markup).toContain('Localized empty claims');
    expect(markup).toContain('Localized empty branches');
  });
});
