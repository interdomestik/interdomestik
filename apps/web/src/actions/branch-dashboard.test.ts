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
    // A KS branch: tenant-scoped sessions below are KS; the cross-tenant test sets its own.
    mocks.getBranchById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant_ks',
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

  // Allow-list: only the admin-portal roles see a branch dashboard; any other role is refused
  // before any read, a missing role included.
  it.each(['member', 'user', 'agent', 'staff', 'promoter', 'auditor', 'global_support', null])(
    'refuses role %j before any read',
    async role => {
      mocks.authorizeSessionTenant.mockResolvedValue({
        session: sessionFor({ role, branchId: 'branch-1' }),
        authority: mintTestTenantAuthority('tenant_ks'),
      });

      await expect(getBranchDashboard('branch-1')).resolves.toEqual({
        success: false,
        error: 'Insufficient permissions',
      });
      expect(mocks.delegateSuperAdminBranchOwner).not.toHaveBeenCalled();
      expect(mocks.getBranchById).not.toHaveBeenCalled();
      expect(mocks.getBranchStats).not.toHaveBeenCalled();
      expect(mocks.getBranchAgents).not.toHaveBeenCalled();
    }
  );

  it("refuses a branch manager on another branch and reads it for the manager's own branch", async () => {
    const authority = mintTestTenantAuthority('tenant_ks');
    mocks.authorizeSessionTenant.mockResolvedValue({
      session: sessionFor({ role: 'branch_manager', branchId: 'branch-1' }),
      authority,
    });
    mocks.getBranchById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant_ks',
      isActive: true,
    });

    await expect(getBranchDashboard('branch-2')).resolves.toEqual({
      success: false,
      error: 'Access denied to this branch',
    });
    expect(mocks.getBranchById).not.toHaveBeenCalled();

    const own = await getBranchDashboard('branch-1');
    expect(own.success).toBe(true);
    expect(mocks.getBranchById).toHaveBeenCalledWith('branch-1', authority);
  });

  it.each(['branch-1 ', ' branch-1'])(
    'refuses a branch manager whose session branch (%j) only matches after trimming',
    async branchId => {
      mocks.authorizeSessionTenant.mockResolvedValue({
        session: sessionFor({ role: 'branch_manager', branchId }),
        authority: mintTestTenantAuthority('tenant_ks'),
      });

      await expect(getBranchDashboard('branch-1')).resolves.toEqual({
        success: false,
        error: 'Access denied to this branch',
      });
      expect(mocks.getBranchById).not.toHaveBeenCalled();
    }
  );

  it.each([null, undefined, '', '   '])(
    'refuses a branch manager without a usable branch (%j), whatever branch is named',
    async branchId => {
      mocks.authorizeSessionTenant.mockResolvedValue({
        session: sessionFor({ role: 'branch_manager', branchId }),
        authority: mintTestTenantAuthority('tenant_ks'),
      });

      for (const named of ['branch-1', '', '   ']) {
        await expect(getBranchDashboard(named)).resolves.toEqual({
          success: false,
          error: 'Access denied to this branch',
        });
      }
      expect(mocks.delegateSuperAdminBranchOwner).not.toHaveBeenCalled();
      expect(mocks.getBranchById).not.toHaveBeenCalled();
    }
  );

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
    mocks.getBranchById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant_mk',
      isActive: true,
    });

    const result = await getBranchDashboard('branch-1');

    expect(result.success).toBe(true);
    expect(mocks.delegateSuperAdminBranchOwner.mock.calls[0][0]).toBe(sessionAuthority);
    expect(mocks.delegateSuperAdminBranchOwner.mock.calls[0][1]).toBe('branch-1');
    expect(mocks.getBranchById.mock.calls[0][1]).toBe(delegated);
    expect(mocks.getBranchStats.mock.calls[0][1]).toBe(delegated);
    expect(mocks.getBranchAgents.mock.calls[0][1]).toBe(delegated);
    expect(mocks.getBranchStats.mock.calls[0][3]).toBe('tenant_mk');
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
