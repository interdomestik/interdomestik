import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminSidebarItems } from '@/components/admin/admin-sidebar-items';
import { resolveAdminNavigationCapabilities } from '@/features/admin/access/admin-navigation-capabilities.server';

const state = vi.hoisted(() => ({ session: vi.fn(), grants: vi.fn() }));
vi.mock('@/lib/auth.server', () => ({ getCachedSession: state.session }));
vi.mock('@interdomestik/database/db', () => ({
  dbAdmin: { query: { userRoles: { findMany: state.grants } } },
}));
vi.mock('./_core.entry', () => ({ default: () => <div>People</div> }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  redirect: () => {
    throw new Error('LOGIN');
  },
}));

import Page from './page';

const props = { params: Promise.resolve({ locale: 'sq' }), searchParams: Promise.resolve({}) };
async function openPage() {
  return Page(props);
}

describe('people route and navigation capability parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.grants.mockResolvedValue([]);
  });

  it.each(['super_admin', 'tenant_admin', 'admin'])(
    '%s can open every people link shown by navigation',
    async role => {
      const session = { user: { id: 'u1', tenantId: 't1', role } };
      state.session.mockResolvedValue(session);
      const capabilities = await resolveAdminNavigationCapabilities(session);
      const links = adminSidebarItems(role, 'branch-a', capabilities).filter(
        item => item.peopleKey
      );
      expect(links).toHaveLength(3);
      expect(renderToStaticMarkup(await openPage())).toContain('People');
    }
  );

  it.each(['branch_manager', 'staff', 'agent', 'member', 'unknown'])(
    '%s is denied and has no people navigation links',
    async role => {
      const session = {
        user: { id: 'u1', tenantId: 't1', role, branchId: 'branch-a' },
      };
      state.session.mockResolvedValue(session);
      await expect(openPage()).rejects.toThrow('NOT_FOUND');
      const capabilities = await resolveAdminNavigationCapabilities(session);
      expect(
        adminSidebarItems(role, 'branch-a', capabilities).filter(item => item.peopleKey)
      ).toHaveLength(0);
    }
  );

  it.each(['staff', 'agent', 'branch_manager'])(
    'preserves explicitly granted tenant admin page and people navigation access for %s',
    async role => {
      const session = { user: { id: 'u1', tenantId: 't1', role } };
      state.session.mockResolvedValue(session);
      state.grants.mockResolvedValue([{ role: 'tenant_admin' }]);
      expect(renderToStaticMarkup(await openPage())).toContain('People');
      const capabilities = await resolveAdminNavigationCapabilities(session);
      expect(
        adminSidebarItems(role, null, capabilities).filter(item => item.peopleKey)
      ).toHaveLength(3);
    }
  );

  it('fails closed when role-grant resolution fails', async () => {
    state.session.mockResolvedValue({ user: { id: 'u1', tenantId: 't1', role: 'admin' } });
    state.grants.mockRejectedValue(new Error('Database unavailable'));
    await expect(openPage()).rejects.toThrow('NOT_FOUND');
  });
});
