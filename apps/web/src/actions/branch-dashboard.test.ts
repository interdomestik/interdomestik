import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeSessionTenant: vi.fn(),
  delegateSuperAdminBranchOwner: vi.fn(),
  getBranchById: vi.fn(),
  getBranchStats: vi.fn(),
  getBranchAgents: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: mocks.authorizeSessionTenant,
}));
vi.mock('@interdomestik/database', () => ({
  delegateSuperAdminBranchOwner: mocks.delegateSuperAdminBranchOwner,
}));
vi.mock('@/actions/branch-dashboard.core', () => ({
  getBranchById: mocks.getBranchById,
  getBranchStats: mocks.getBranchStats,
  getBranchAgents: mocks.getBranchAgents,
}));

import { getBranchDashboard } from './branch-dashboard';

function sessionFor(user: Record<string, unknown>) {
  return { user: { id: 'user-1', tenantId: 'tenant_ks', branchId: null, ...user } };
}

describe('getBranchDashboard tenant authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBranchById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant_mk',
      isActive: true,
    });
    mocks.getBranchStats.mockResolvedValue({ ok: true, value: {} });
    mocks.getBranchAgents.mockResolvedValue([]);
  });

  it('returns unauthorized without a session and reads nothing', async () => {
    mocks.authorizeSessionTenant.mockResolvedValue(null);

    await expect(getBranchDashboard('branch-1')).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
    });
    expect(mocks.getBranchById).not.toHaveBeenCalled();
  });

  it('reads a tenant admin branch under the session authority', async () => {
    const authority = mintTestTenantAuthority('tenant_ks');
    mocks.authorizeSessionTenant.mockResolvedValue({
      session: sessionFor({ role: 'tenant_admin' }),
      authority,
    });

    const result = await getBranchDashboard('branch-1');

    expect(result.success).toBe(true);
    expect(mocks.delegateSuperAdminBranchOwner).not.toHaveBeenCalled();
    expect(mocks.getBranchById.mock.calls[0][1]).toBe(authority);
    expect(mocks.getBranchStats.mock.calls[0][1]).toBe(authority);
    expect(mocks.getBranchAgents.mock.calls[0][1]).toBe(authority);
  });

  it('reads a super admin cross-tenant branch under the delegated owner authority', async () => {
    const sessionAuthority = mintTestTenantAuthority('tenant_ks');
    const delegated = mintTestTenantAuthority('tenant_mk');
    mocks.authorizeSessionTenant.mockResolvedValue({
      session: sessionFor({ role: 'super_admin' }),
      authority: sessionAuthority,
    });
    mocks.delegateSuperAdminBranchOwner.mockResolvedValue({
      branchId: 'branch-1',
      tenantId: 'tenant_mk',
      authority: delegated,
    });

    const result = await getBranchDashboard('branch-1');

    expect(result.success).toBe(true);
    expect(mocks.delegateSuperAdminBranchOwner.mock.calls[0][0]).toBe(sessionAuthority);
    expect(mocks.delegateSuperAdminBranchOwner.mock.calls[0][1]).toBe('branch-1');
    expect(mocks.getBranchById.mock.calls[0][1]).toBe(delegated);
    expect(mocks.getBranchStats.mock.calls[0][1]).toBe(delegated);
    expect(mocks.getBranchAgents.mock.calls[0][1]).toBe(delegated);
  });

  it('fails closed when a super admin names an unknown branch or a branch code', async () => {
    mocks.authorizeSessionTenant.mockResolvedValue({
      session: sessionFor({ role: 'super_admin' }),
      authority: mintTestTenantAuthority('tenant_ks'),
    });
    mocks.delegateSuperAdminBranchOwner.mockResolvedValueOnce(null).mockResolvedValueOnce({
      branchId: 'branch-by-id',
      tenantId: 'tenant_mk',
      authority: mintTestTenantAuthority('tenant_mk'),
    });

    await expect(getBranchDashboard('branch-1')).resolves.toEqual({
      success: false,
      error: 'Branch not found',
    });
    await expect(getBranchDashboard('BR-CODE')).resolves.toEqual({
      success: false,
      error: 'Branch not found',
    });
    expect(mocks.getBranchById).not.toHaveBeenCalled();
  });
});
