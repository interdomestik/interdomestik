import { render } from '@testing-library/react';
import { vi } from 'vitest';
import StaffSupportHandoffsPage from './_core.entry';

const mocks = await vi.hoisted(async () => {
  const { createStaffHandoffMocks } = await import('./_core.entry.test-support');
  return createStaffHandoffMocks();
});
vi.mock('@/actions/support-handoffs/lifecycle', () => ({
  acceptSupportHandoff: mocks.acceptSupportHandoff,
  closeSupportHandoff: mocks.closeSupportHandoff,
  reassignSupportHandoff: mocks.reassignSupportHandoff,
}));
vi.mock('@/actions/support-handoffs/detail', () => ({
  getSupportHandoffDetail: mocks.getSupportHandoffDetail,
}));
vi.mock('@/actions/support-handoffs/response', () => ({
  updateSupportHandoffPublicResponse: mocks.updateSupportHandoffPublicResponse,
}));
vi.mock('@/components/shell/session', () => ({
  getSessionSafe: mocks.getSessionSafe,
  requireSessionOrRedirect: mocks.requireSessionOrRedirect,
}));
vi.mock('@/lib/tenant-authority.server', async () =>
  (await import('./_core.entry.test-support')).createTenantAuthorityServerMock(mocks)
);
vi.mock('@/i18n/routing', async () => (await import('./_core.entry.test-support')).routingMock);
vi.mock('@interdomestik/database', async () =>
  (await import('./_core.entry.test-support')).createDatabaseMock(mocks)
);
vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn((_tenantId, _column, condition) => ({ condition, scoped: true })),
}));
vi.mock('@interdomestik/domain-claims/support-handoffs/queue', () => ({
  getStaffSupportHandoffQueue: mocks.getQueue,
}));
vi.mock('@interdomestik/ui', async () => (await import('./_core.entry.test-support')).uiMock);
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  setRequestLocale: mocks.setRequestLocale,
}));
vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  useRouter: () => ({
    refresh: mocks.routerRefresh,
  }),
}));
async function renderPage(searchParams: Record<string, string | string[] | undefined> = {}) {
  const tree = await StaffSupportHandoffsPage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve(searchParams),
  });
  render(tree);
}

export { mocks, renderPage };
