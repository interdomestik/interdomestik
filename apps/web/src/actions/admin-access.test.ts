import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeSessionTenant: vi.fn(),
  requireTenantAdminOrBranchManagerSession: vi.fn(),
  authority: {} as object,
}));

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: mocks.authorizeSessionTenant,
}));

vi.mock('@interdomestik/domain-users/admin/access', () => ({
  requireTenantAdminOrBranchManagerSession: mocks.requireTenantAdminOrBranchManagerSession,
}));

import { canAccessAdmin } from './admin-access';

describe('canAccessAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows primary super admin to enter the admin portal', async () => {
    const session = { user: { role: 'super_admin' } };
    mocks.authorizeSessionTenant.mockResolvedValueOnce({ session, authority: mocks.authority });
    mocks.requireTenantAdminOrBranchManagerSession.mockResolvedValueOnce(session);

    await expect(canAccessAdmin()).resolves.toBe(true);
    expect(mocks.requireTenantAdminOrBranchManagerSession).toHaveBeenCalledWith(
      session,
      mocks.authority
    );
  });

  it('requires tenant validation for primary admin roles', async () => {
    const session = { user: { role: 'admin' } };
    mocks.authorizeSessionTenant.mockResolvedValueOnce({ session, authority: mocks.authority });
    mocks.requireTenantAdminOrBranchManagerSession.mockRejectedValueOnce(
      new Error('Missing tenant')
    );

    await expect(canAccessAdmin()).resolves.toBe(false);
    expect(mocks.requireTenantAdminOrBranchManagerSession).toHaveBeenCalledWith(
      session,
      mocks.authority
    );
  });

  it('delegates branch manager access to the domain guard', async () => {
    const session = {
      user: { role: 'branch_manager', tenantId: 'tenant-1', branchId: 'branch-1' },
    };
    mocks.authorizeSessionTenant.mockResolvedValueOnce({ session, authority: mocks.authority });
    mocks.requireTenantAdminOrBranchManagerSession.mockResolvedValueOnce(session);

    await expect(canAccessAdmin()).resolves.toBe(true);
    expect(mocks.requireTenantAdminOrBranchManagerSession).toHaveBeenCalledWith(
      session,
      mocks.authority
    );
  });

  it('returns true when the domain guard resolves for any primary role', async () => {
    const session = { user: { role: 'staff' } };
    mocks.authorizeSessionTenant.mockResolvedValueOnce({ session, authority: mocks.authority });
    mocks.requireTenantAdminOrBranchManagerSession.mockResolvedValueOnce(session);

    await expect(canAccessAdmin()).resolves.toBe(true);
    expect(mocks.requireTenantAdminOrBranchManagerSession).toHaveBeenCalledWith(
      session,
      mocks.authority
    );
  });

  it('denies staff users from entering the admin portal', async () => {
    mocks.authorizeSessionTenant.mockResolvedValueOnce({
      session: { user: { role: 'staff' } },
      authority: mocks.authority,
    });
    mocks.requireTenantAdminOrBranchManagerSession.mockRejectedValueOnce(new Error('Unauthorized'));

    await expect(canAccessAdmin()).resolves.toBe(false);
  });

  it('denies without an authenticated session or when the session has no tenant', async () => {
    mocks.authorizeSessionTenant.mockResolvedValueOnce(null);
    mocks.requireTenantAdminOrBranchManagerSession.mockRejectedValueOnce(new Error('Unauthorized'));
    await expect(canAccessAdmin()).resolves.toBe(false);
    expect(mocks.requireTenantAdminOrBranchManagerSession).toHaveBeenCalledWith(null, undefined);

    mocks.authorizeSessionTenant.mockRejectedValueOnce(new Error('Session missing tenantId'));
    await expect(canAccessAdmin()).resolves.toBe(false);
    expect(mocks.requireTenantAdminOrBranchManagerSession).toHaveBeenCalledTimes(1);
  });
});
