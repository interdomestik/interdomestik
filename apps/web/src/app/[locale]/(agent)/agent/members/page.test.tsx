import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  headers: vi.fn(),
  read: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
  setRequestLocale: vi.fn(),
}));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('./_core', () => ({ getAgentMembersPageData: mocks.read }));
vi.mock('./components/agent-members-search', () => ({ AgentMembersSearch: () => null }));
vi.mock('@/i18n/routing', () => ({ Link: () => null }));

import AgentMembersPage from './page';

describe('AgentMembersPage session capability', () => {
  const params = Promise.resolve({ locale: 'de' });
  const requestHeaders = new Headers({ cookie: 'test-session' });
  const authority = mintTestTenantAuthority('tenant_mk', { userId: 'agent-1', role: 'agent' });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(requestHeaders);
    mocks.authorize.mockResolvedValue({
      session: {
        user: { id: 'agent-1', role: 'agent', tenantId: 'tenant_ks', accessTenantId: 'tenant_mk' },
      },
      authority,
    });
    mocks.read.mockResolvedValue({ attentionCount: 0, members: [], openClaimsTotal: 0 });
  });

  it('authenticates request headers and forwards the exact access-tenant authority', async () => {
    await AgentMembersPage({ params, searchParams: Promise.resolve({ q: 'Arta' }) });
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(requestHeaders);
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith({
      authority,
      searchParams: { q: 'Arta' },
    });
  });

  it('redirects unauthenticated requests before reading members', async () => {
    mocks.authorize.mockResolvedValue(null);
    await expect(AgentMembersPage({ params })).rejects.toThrow('redirect:/de/login');
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it.each(['member', 'admin', 'super_admin', null])(
    'denies the %s role before reading members',
    async role => {
      mocks.authorize.mockResolvedValue({ session: { user: { id: 'user-1', role } }, authority });
      await expect(AgentMembersPage({ params })).rejects.toThrow('not-found');
      expect(mocks.read).not.toHaveBeenCalled();
    }
  );

  it('propagates missing tenant authorization without reading members', async () => {
    mocks.authorize.mockRejectedValue(new Error('Missing tenant'));
    await expect(AgentMembersPage({ params })).rejects.toThrow('Missing tenant');
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
