import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBranchKPIs: vi.fn(),
  getSuperAdminKPIs: vi.fn(),
  getTenantAdminKPIs: vi.fn(),
  runAuthenticatedAction: vi.fn(),
}));

vi.mock('@/lib/safe-action', () => ({
  runAuthenticatedAction: mocks.runAuthenticatedAction,
}));

vi.mock('@interdomestik/domain-analytics', () => ({
  getBranchKPIs: mocks.getBranchKPIs,
  getSuperAdminKPIs: mocks.getSuperAdminKPIs,
  getTenantAdminKPIs: mocks.getTenantAdminKPIs,
}));

import { getBranchKPIsAction, getSuperAdminKPIsAction, getTenantAdminKPIsAction } from './v2';

describe('analytics v2 actions role boundaries', () => {
  const authority = mintTestTenantAuthority('tenant-1');
  let actionContext: {
    userRole: string;
    tenantId: string;
    authority: typeof authority;
    scope: { branchId?: string | null };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    actionContext = {
      userRole: 'super_admin',
      tenantId: 'tenant-1',
      authority,
      scope: { branchId: 'branch-1' },
    };
    mocks.runAuthenticatedAction.mockImplementation(async callback => callback(actionContext));
    mocks.getBranchKPIs.mockResolvedValue({ branchId: 'branch-2' });
    mocks.getTenantAdminKPIs.mockResolvedValue({ tenantId: 'tenant-1' });
    mocks.getSuperAdminKPIs.mockResolvedValue({ totalTenants: 2 });
  });

  it('passes the super admin role as the actor for platform KPIs', async () => {
    await expect(getSuperAdminKPIsAction()).resolves.toEqual({ totalTenants: 2 });
    expect(mocks.getSuperAdminKPIs).toHaveBeenCalledWith(authority);
  });

  it.each(['tenant_admin', 'staff', 'branch_manager', 'agent', 'member'])(
    'rejects %s from platform KPIs before the domain call',
    async userRole => {
      actionContext = { ...actionContext, userRole };

      await expect(getSuperAdminKPIsAction()).rejects.toThrow(
        'Unauthorized: Super Admin access required'
      );
      expect(mocks.getSuperAdminKPIs).not.toHaveBeenCalled();
    }
  );

  it('keeps super admins authorized for tenant admin KPIs', async () => {
    await expect(getTenantAdminKPIsAction()).resolves.toEqual({ tenantId: 'tenant-1' });
    expect(mocks.getTenantAdminKPIs).toHaveBeenCalledWith(authority);
  });

  it('keeps super admins authorized for branch KPIs', async () => {
    await expect(getBranchKPIsAction('branch-2')).resolves.toEqual({ branchId: 'branch-2' });
    expect(mocks.getBranchKPIs).toHaveBeenCalledWith(authority, 'branch-2');
  });

  it('rejects branch managers from tenant admin KPIs', async () => {
    actionContext = { ...actionContext, userRole: 'branch_manager' };

    await expect(getTenantAdminKPIsAction()).rejects.toThrow(
      'Unauthorized: Tenant Admin or Staff access required'
    );
    expect(mocks.getTenantAdminKPIs).not.toHaveBeenCalled();
  });
});
