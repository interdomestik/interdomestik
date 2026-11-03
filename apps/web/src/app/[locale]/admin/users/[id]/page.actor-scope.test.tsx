import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionSafe: vi.fn(),
  authorizeSessionTenant: vi.fn(),
  resolveAdminTenantAuthority: vi.fn(),
  getTenantClassificationOptions: vi.fn(),
  getAdminUserProfileCore: vi.fn(),
}));

vi.mock('@/components/shell/session', () => ({ getSessionSafe: mocks.getSessionSafe }));
vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: mocks.authorizeSessionTenant,
}));
vi.mock('./tenant-context', () => ({
  resolveAdminTenantAuthority: mocks.resolveAdminTenantAuthority,
}));
vi.mock('./tenant-classification', () => ({
  getTenantClassificationOptions: mocks.getTenantClassificationOptions,
}));
vi.mock('./_core', () => ({ getAdminUserProfileCore: mocks.getAdminUserProfileCore }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
  setRequestLocale: vi.fn(),
}));
vi.mock('@/i18n/routing', () => ({ Link: () => null }));
vi.mock('./_components/admin-user-roles-panel', () => ({ AdminUserRolesPanel: () => null }));
vi.mock('./_components/agent-info-card', () => ({ AgentInfoCard: () => null }));
vi.mock('./_components/claims-stats-card', () => ({ ClaimsStatsCard: () => null }));
vi.mock('./_components/membership-info-card', () => ({ MembershipInfoCard: () => null }));
vi.mock('./_components/preferences-card', () => ({ PreferencesCard: () => null }));
vi.mock('./_components/recent-claims-card', () => ({ RecentClaimsCard: () => null }));
vi.mock('./_components/user-profile-header', () => ({ UserProfileHeader: () => null }));

import { AdminUserDetailV2Page } from '@/features/admin/users/components/AdminUserDetailV2Page';

import MemberProfilePage from './page';

type DetailProps = Parameters<typeof AdminUserDetailV2Page>[0];

const SESSION_AUTHORITY = mintTestTenantAuthority('t1', { userId: 'actor-1' });
const READ_AUTHORITY = mintTestTenantAuthority('t1', { userId: 'actor-1' });

async function mount(): Promise<DetailProps> {
  const element = (await MemberProfilePage({
    params: Promise.resolve({ locale: 'mk', id: 'u1' }),
    searchParams: Promise.resolve({}),
  })) as ReactElement<DetailProps>;
  expect(element.type).toBe(AdminUserDetailV2Page);
  return element.props;
}

describe('admin user profile mounted caller actor scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeSessionTenant.mockResolvedValue({
      session: { user: { id: 'actor-1' } },
      authority: SESSION_AUTHORITY,
    });
    mocks.resolveAdminTenantAuthority.mockResolvedValue(READ_AUTHORITY);
    mocks.getTenantClassificationOptions.mockResolvedValue([]);
    mocks.getAdminUserProfileCore.mockResolvedValue({ kind: 'not_found' });
  });

  it('forwards the session role and branch through the detail page to the core', async () => {
    mocks.getSessionSafe.mockResolvedValue({
      user: { id: 'actor-1', role: 'branch_manager', branchId: 'b-A', tenantId: 't1' },
    });
    const props = await mount();
    expect(props.authority).toBe(READ_AUTHORITY);
    expect(mocks.resolveAdminTenantAuthority.mock.calls[0]?.[0].authority).toBe(SESSION_AUTHORITY);
    expect(props).toMatchObject({
      id: 'u1',
      actorRole: 'branch_manager',
      actorBranchId: 'b-A',
    });
    await expect(AdminUserDetailV2Page(props)).rejects.toThrow('notFound');
    expect(mocks.getAdminUserProfileCore).toHaveBeenCalledWith({
      userId: 'u1',
      authority: READ_AUTHORITY,
      actor: { role: 'branch_manager', branchId: 'b-A' },
      recentClaimsLimit: 6,
    });
  });

  it('forwards a null branch when the session has none', async () => {
    mocks.getSessionSafe.mockResolvedValue({
      user: { id: 'actor-1', role: 'super_admin', tenantId: 't0' },
    });
    const props = await mount();
    expect(props.actorBranchId).toBeNull();
    await expect(AdminUserDetailV2Page(props)).rejects.toThrow('notFound');
    expect(mocks.getAdminUserProfileCore).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { role: 'super_admin', branchId: null } })
    );
  });

  it('reads under no authority when the authorized session belongs to another user', async () => {
    mocks.getSessionSafe.mockResolvedValue({
      user: { id: 'actor-2', role: 'tenant_admin', tenantId: 't1' },
    });
    await mount();
    expect(mocks.resolveAdminTenantAuthority.mock.calls[0]?.[0].authority).toBeNull();
  });

  it('reads under no authority when the session has no tenant', async () => {
    mocks.authorizeSessionTenant.mockRejectedValue(new Error('missing tenant'));
    mocks.getSessionSafe.mockResolvedValue({ user: { id: 'actor-1', role: 'super_admin' } });
    await mount();
    expect(mocks.resolveAdminTenantAuthority.mock.calls[0]?.[0].authority).toBeNull();
  });
});
