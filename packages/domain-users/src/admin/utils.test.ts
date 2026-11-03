import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ delegateSuperAdminTenant: vi.fn() }));
vi.mock('@interdomestik/database', () => ({
  delegateSuperAdminTenant: hoisted.delegateSuperAdminTenant,
}));

import { resolveTenantAuthority, resolveTenantId } from './utils';
import type { UserSession } from '../types';

const session = {
  user: {
    id: 'admin-1',
    role: 'admin',
    tenantId: 'tenant_legal_compat',
    accessTenantId: 'tenant_access',
  },
} satisfies UserSession;

describe('resolveTenantId', () => {
  it('uses accessTenantId for non-super-admin access scope', () => {
    expect(resolveTenantId(session, 'tenant_access')).toBe('tenant_access');
    expect(() => resolveTenantId(session, 'tenant_legal_compat')).toThrow('Unauthorized');
    expect(resolveTenantId(session)).toBe('tenant_access');
  });

  it('preserves explicit super-admin tenant selection', () => {
    expect(
      resolveTenantId(
        { user: { id: 'root', role: 'super_admin', tenantId: 'tenant_legal_compat' } },
        'tenant_any'
      )
    ).toBe('tenant_any');
  });
});

describe('resolveTenantAuthority', () => {
  const superSession = {
    user: { id: 'root', role: 'super_admin', tenantId: 'tenant_home' },
  } satisfies UserSession;
  const superAuthority = mintTestTenantAuthority('tenant_home', {
    userId: 'root',
    role: 'super_admin',
  });
  const adminAuthority = mintTestTenantAuthority('tenant_access', {
    userId: 'admin-1',
    role: 'admin',
  });

  beforeEach(() => {
    hoisted.delegateSuperAdminTenant.mockReset();
  });

  it('returns the session authority when no other tenant is requested', async () => {
    await expect(resolveTenantAuthority(session, adminAuthority)).resolves.toBe(adminAuthority);
    await expect(resolveTenantAuthority(session, adminAuthority, 'tenant_access')).resolves.toBe(
      adminAuthority
    );
    expect(hoisted.delegateSuperAdminTenant).not.toHaveBeenCalled();
  });

  it('refuses a missing authority or one minted for another user', async () => {
    await expect(resolveTenantAuthority(session, null)).rejects.toThrow('Unauthorized');
    await expect(resolveTenantAuthority(session, superAuthority)).rejects.toThrow('Unauthorized');
  });

  it('refuses a non-super-admin naming another tenant without delegating', async () => {
    await expect(
      resolveTenantAuthority(session, adminAuthority, 'tenant_legal_compat')
    ).rejects.toThrow('Unauthorized');
    expect(hoisted.delegateSuperAdminTenant).not.toHaveBeenCalled();
  });

  it('delegates a super_admin to an active requested tenant and fails closed otherwise', async () => {
    const delegated = mintTestTenantAuthority('tenant_any');
    hoisted.delegateSuperAdminTenant.mockResolvedValueOnce(delegated);
    await expect(resolveTenantAuthority(superSession, superAuthority, 'tenant_any')).resolves.toBe(
      delegated
    );
    expect(hoisted.delegateSuperAdminTenant).toHaveBeenCalledWith(superAuthority, 'tenant_any');

    hoisted.delegateSuperAdminTenant.mockResolvedValueOnce(null);
    await expect(
      resolveTenantAuthority(superSession, superAuthority, 'tenant_gone')
    ).rejects.toThrow('Unauthorized');
  });
});
