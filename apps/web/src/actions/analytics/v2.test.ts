import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBranchKPIs: vi.fn(),
  getTenantAdminKPIs: vi.fn(),
  runAuthenticatedAction: vi.fn(),
}));

vi.mock('@/lib/safe-action', () => ({
  runAuthenticatedAction: mocks.runAuthenticatedAction,
}));

vi.mock('@interdomestik/domain-analytics', () => ({
  getBranchKPIs: mocks.getBranchKPIs,
  getSuperAdminKPIs: vi.fn(),
  getTenantAdminKPIs: mocks.getTenantAdminKPIs,
}));

import { getBranchKPIsAction, getTenantAdminKPIsAction } from './v2';

describe('analytics v2 actions role boundaries', () => {
  let actionContext: {
    userRole: string;
    tenantId: string;
    scope: { branchId?: string | null };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    actionContext = {
      userRole: 'super_admin',
      tenantId: 'tenant-1',
      scope: { branchId: 'branch-1' },
    };
    mocks.runAuthenticatedAction.mockImplementation(async callback => callback(actionContext));
    mocks.getBranchKPIs.mockResolvedValue({ branchId: 'branch-2' });
    mocks.getTenantAdminKPIs.mockResolvedValue({ tenantId: 'tenant-1' });
  });

  it('keeps super admins authorized for tenant admin KPIs', async () => {
    await expect(getTenantAdminKPIsAction()).resolves.toEqual({ tenantId: 'tenant-1' });
    expect(mocks.getTenantAdminKPIs).toHaveBeenCalledWith('tenant-1');
  });

  it('keeps super admins authorized for branch KPIs', async () => {
    await expect(getBranchKPIsAction('branch-2')).resolves.toEqual({ branchId: 'branch-2' });
    expect(mocks.getBranchKPIs).toHaveBeenCalledWith('tenant-1', 'branch-2');
  });

  it('rejects branch managers from tenant admin KPIs', async () => {
    actionContext = { ...actionContext, userRole: 'branch_manager' };

    await expect(getTenantAdminKPIsAction()).rejects.toThrow(
      'Unauthorized: Tenant Admin or Staff access required'
    );
    expect(mocks.getTenantAdminKPIs).not.toHaveBeenCalled();
  });
});
