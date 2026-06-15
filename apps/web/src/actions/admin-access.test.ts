import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActionContext: vi.fn(),
  requireTenantAdminOrBranchManagerSession: vi.fn(),
}));

vi.mock('./admin-users/context', () => ({
  getActionContext: mocks.getActionContext,
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
    mocks.getActionContext.mockResolvedValueOnce({
      requestHeaders: new Headers(),
      session,
    });
    mocks.requireTenantAdminOrBranchManagerSession.mockResolvedValueOnce(session);

    await expect(canAccessAdmin()).resolves.toBe(true);
    expect(mocks.requireTenantAdminOrBranchManagerSession).toHaveBeenCalledWith(session);
  });

  it('requires tenant validation for primary admin roles', async () => {
    const session = { user: { role: 'admin' } };
    mocks.getActionContext.mockResolvedValueOnce({
      requestHeaders: new Headers(),
      session,
    });
    mocks.requireTenantAdminOrBranchManagerSession.mockRejectedValueOnce(
      new Error('Missing tenant')
    );

    await expect(canAccessAdmin()).resolves.toBe(false);
    expect(mocks.requireTenantAdminOrBranchManagerSession).toHaveBeenCalledWith(session);
  });

  it('delegates branch manager access to the domain guard', async () => {
    const session = {
      user: { role: 'branch_manager', tenantId: 'tenant-1', branchId: 'branch-1' },
    };
    mocks.getActionContext.mockResolvedValueOnce({
      requestHeaders: new Headers(),
      session,
    });
    mocks.requireTenantAdminOrBranchManagerSession.mockResolvedValueOnce(session);

    await expect(canAccessAdmin()).resolves.toBe(true);
    expect(mocks.requireTenantAdminOrBranchManagerSession).toHaveBeenCalledWith(session);
  });

  it('returns true when the domain guard resolves for any primary role', async () => {
    const session = { user: { role: 'staff' } };
    mocks.getActionContext.mockResolvedValueOnce({
      requestHeaders: new Headers(),
      session,
    });
    mocks.requireTenantAdminOrBranchManagerSession.mockResolvedValueOnce(session);

    await expect(canAccessAdmin()).resolves.toBe(true);
    expect(mocks.requireTenantAdminOrBranchManagerSession).toHaveBeenCalledWith(session);
  });

  it('denies staff users from entering the admin portal', async () => {
    mocks.getActionContext.mockResolvedValueOnce({
      requestHeaders: new Headers(),
      session: { user: { role: 'staff' } },
    });
    mocks.requireTenantAdminOrBranchManagerSession.mockRejectedValueOnce(new Error('Unauthorized'));

    await expect(canAccessAdmin()).resolves.toBe(false);
  });
});
