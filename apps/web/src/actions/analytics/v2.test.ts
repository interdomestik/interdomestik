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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runAuthenticatedAction.mockImplementation(async callback =>
      callback({
        userRole: 'super_admin',
        tenantId: 'tenant-1',
        scope: { branchId: 'branch-1' },
      })
    );
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
});
