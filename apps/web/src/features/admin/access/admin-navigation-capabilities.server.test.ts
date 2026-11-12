import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminSidebarItems } from '@/components/admin/admin-sidebar-items';

const state = vi.hoisted(() => ({
  grants: vi.fn(),
  session: vi.fn(),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock('@interdomestik/database/db', () => ({
  dbAdmin: { query: { userRoles: { findMany: state.grants } } },
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: state.session } } }));
vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  eq: state.eq,
}));

import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { hasAdminAnalyticsReadAccess } from './admin-analytics-access.server';
import { resolveAdminNavigationCapabilities } from './admin-navigation-capabilities.server';

describe('server-resolved admin navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.grants.mockResolvedValue([]);
  });

  it.each([
    ['admin', [], null, true, true, false],
    ['tenant_admin', [], null, true, true, false],
    ['super_admin', [], null, true, true, true],
    ['staff', [], null, false, false, false],
    ['agent', [], null, false, false, false],
    ['staff', ['tenant_admin'], null, true, true, false],
    ['agent', ['tenant_admin'], null, true, true, false],
    ['staff', ['super_admin'], null, true, true, false],
    ['staff', ['member'], null, false, false, false],
    ['branch_manager', [], 'branch-a', false, true, false],
    ['branch_manager', ['tenant_admin'], 'branch-a', true, true, false],
    ['branch_manager', ['tenant_admin'], null, true, false, false],
    ['branch_manager', ['tenant_admin'], '   ', true, false, false],
    ['member', ['tenant_admin'], null, true, false, false],
  ] as const)(
    'matches route access for primary %s, grants %j and branch %j',
    async (role, grants, branchId, people, analytics, settings) => {
      const session = { user: { id: 'u1', role, tenantId: 'tenant-1', branchId } };
      state.grants.mockResolvedValue(grants.map(grant => ({ role: grant })));
      state.session.mockResolvedValue(session);
      const capabilities = await resolveAdminNavigationCapabilities(session);
      expect(capabilities).toEqual({ canAccessUsers: people, canReadAnalytics: analytics });
      const paths = adminSidebarItems(role, branchId, capabilities).map(item => item.href);
      for (const href of [
        '/admin/users',
        '/admin/users?role=agent',
        '/admin/users?role=admin,staff',
      ]) {
        expect(paths.includes(href)).toBe(people);
      }
      expect(paths.includes('/admin/analytics')).toBe(analytics);
      expect(paths.includes('/admin/settings')).toBe(settings);

      const authorized = await authorizeSessionTenant(new Headers());
      if (!authorized) throw new Error('Expected authenticated tenant authority');
      await expect(hasAdminAnalyticsReadAccess(authorized.authority)).resolves.toBe(analytics);
    }
  );

  it('looks up grants for the access tenant instead of the compatibility tenant', async () => {
    state.grants.mockImplementationOnce(async query => {
      query.where(
        { userId: 'user_id', tenantId: 'tenant_id' },
        { and: (...parts: unknown[]) => parts }
      );
      return [{ role: 'tenant_admin' }];
    });
    await expect(
      resolveAdminNavigationCapabilities({
        user: {
          id: 'u1',
          role: 'staff',
          tenantId: 'tenant-legal',
          accessTenantId: 'tenant-access',
        },
      })
    ).resolves.toEqual({ canAccessUsers: true, canReadAnalytics: true });
    expect(state.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(state.eq).toHaveBeenCalledWith('tenant_id', 'tenant-access');
    expect(state.eq).not.toHaveBeenCalledWith('tenant_id', 'tenant-legal');
    expect(state.grants).toHaveBeenCalledOnce();
  });

  it.each(['staff', 'agent'])('fails closed for %s when grant lookup fails', async role => {
    state.grants.mockRejectedValue(new Error('Database unavailable'));
    await expect(
      resolveAdminNavigationCapabilities({
        user: { id: 'u1', role, tenantId: 'tenant-1' },
      })
    ).resolves.toEqual({ canAccessUsers: false, canReadAnalytics: false });
  });

  it('returns no capabilities without a session', async () => {
    await expect(resolveAdminNavigationCapabilities(null)).resolves.toEqual({
      canAccessUsers: false,
      canReadAnalytics: false,
    });
    expect(state.grants).not.toHaveBeenCalled();
  });
});
