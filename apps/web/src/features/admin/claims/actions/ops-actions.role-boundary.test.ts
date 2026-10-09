import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_ROLES,
  ENTRYPOINTS,
  FORBIDDEN_USERS,
  SAFE_FAILURE,
  expectNoResourceAccess,
  mocks,
  signIn,
  tenant,
  useTenantTx,
} from './ops-actions-test-setup.spec';

describe.each(ENTRYPOINTS)('%s exercised-role admission', (_name, invoke) => {
  it('denies a missing session before any resource access', async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(invoke()).resolves.toEqual({ success: false, error: 'Unauthorized' });
    expectNoResourceAccess();
  });

  it.each(FORBIDDEN_USERS)('denies %s before any resource access', async (_label, user) => {
    signIn(user);

    await expect(invoke()).resolves.toEqual({ success: false, error: 'Unauthorized' });
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expectNoResourceAccess();
  });

  it.each(ADMIN_ROLES)('admits %s through exactly one tenant transaction', async role => {
    signIn({ role });

    await expect(invoke()).resolves.toEqual({ success: true });
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-mk', role },
      expect.any(Function)
    );
    expect(mocks.directDb).not.toHaveBeenCalled();
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ['/en/admin/claims/claim-1', 'page'],
      ['/en/admin/claims', 'page'],
    ]);
  });

  it('selects the trusted access tenant when it diverges from the home tenant', async () => {
    signIn({ role: 'tenant_admin', tenantId: 'tenant-mk', accessTenantId: 'tenant-ks' });

    await invoke();

    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-ks', role: 'tenant_admin' },
      expect.any(Function)
    );
  });

  it('denies a claim the home-anchored writer predicate cannot see, without effects', async () => {
    // Missing, foreign-tenant, explicit-foreign-access and access-only transferred rows all
    // resolve to "not found" here; the restricted Postgres fixture must prove each separately.
    useTenantTx({ claim: null, lockedRows: 0 });
    signIn({ role: 'admin' });

    await expect(invoke()).resolves.toEqual({
      success: false,
      error: 'Claim not found or access denied',
    });
    expect(mocks.transitionInTx).not.toHaveBeenCalled();
    expect(tenant.effects.filter(effect => effect.kind === 'insert')).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('fails closed with a sanitized error when the session has no tenant', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    signIn({ role: 'admin', tenantId: null });

    await expect(invoke()).resolves.toEqual(SAFE_FAILURE);
    expectNoResourceAccess();
    consoleError.mockRestore();
  });
});
