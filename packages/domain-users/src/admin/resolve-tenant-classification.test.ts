import {
  adminAuthority,
  adminSession,
  delegatedMkAuthority,
  mocks,
  superAdminSession,
  superAuthority,
} from './resolve-tenant-classification.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TENANT_REASSIGNMENT_UNAVAILABLE_ERROR,
  resolveTenantClassificationCore,
} from './resolve-tenant-classification';

describe('resolveTenantClassificationCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mocks.withTenantContext.mockImplementation(
      async (_ctx: unknown, callback: (tx: unknown) => unknown) => callback(mocks.tx)
    );
    mocks.findFirst.mockResolvedValue({ id: 'member-1', tenantClassificationPending: true });
    mocks.returning.mockResolvedValue([{ id: 'member-1' }]);
  });

  describe('confirm_current', () => {
    it('confirms the current tenant and clears pending inside that tenant context', async () => {
      const result = await resolveTenantClassificationCore({
        session: adminSession,
        authority: adminAuthority,
        userId: 'member-1',
        currentTenantId: 'tenant_ks',
      });

      expect(result).toEqual({
        success: true,
        data: {
          previousTenantId: 'tenant_ks',
          tenantId: 'tenant_ks',
          previousPending: true,
          tenantClassificationPending: false,
          resolutionMode: 'confirm_current',
        },
      });
      expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
      expect(mocks.withTenantContext.mock.calls[0][0]).toBe(adminAuthority);
      expect(mocks.delegateSuperAdminTenant).not.toHaveBeenCalled();
      expect(mocks.set).toHaveBeenCalledWith({ tenantClassificationPending: false });
      expect(mocks.withTenant).toHaveBeenCalledWith(
        'tenant_ks',
        'user.tenantId',
        expect.anything()
      );
    });

    it('reports previousPending false for an already-resolved user', async () => {
      mocks.findFirst.mockResolvedValue({ id: 'member-1', tenantClassificationPending: false });

      const result = await resolveTenantClassificationCore({
        session: adminSession,
        authority: adminAuthority,
        userId: 'member-1',
        currentTenantId: 'tenant_ks',
      });

      expect(result).toMatchObject({ success: true, data: { previousPending: false } });
    });

    it('returns User not found, without updating, when the user is not in the tenant', async () => {
      mocks.findFirst.mockResolvedValue(undefined);

      const result = await resolveTenantClassificationCore({
        session: adminSession,
        authority: adminAuthority,
        userId: 'member-1',
        currentTenantId: 'tenant_ks',
      });

      expect(result).toEqual({ error: 'User not found' });
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it('returns User not found when the update affects no row', async () => {
      mocks.returning.mockResolvedValue([]);

      const result = await resolveTenantClassificationCore({
        session: adminSession,
        authority: adminAuthority,
        userId: 'member-1',
        currentTenantId: 'tenant_ks',
      });

      expect(result).toEqual({ error: 'User not found' });
    });

    it('lets a super admin confirm a non-session current tenant under that tenant context', async () => {
      mocks.delegateSuperAdminTenant.mockResolvedValueOnce(delegatedMkAuthority);
      const result = await resolveTenantClassificationCore({
        session: superAdminSession,
        authority: superAuthority,
        userId: 'member-1',
        currentTenantId: 'tenant_mk',
        targetTenantId: 'tenant_mk',
      });

      expect(result).toMatchObject({
        success: true,
        data: { previousTenantId: 'tenant_mk', tenantId: 'tenant_mk' },
      });
      expect(mocks.delegateSuperAdminTenant).toHaveBeenCalledWith(superAuthority, 'tenant_mk');
      expect(mocks.withTenantContext.mock.calls[0][0]).toBe(delegatedMkAuthority);
    });

    it('rejects a super admin naming an unknown or inactive current tenant', async () => {
      mocks.delegateSuperAdminTenant.mockResolvedValueOnce(null);
      const result = await resolveTenantClassificationCore({
        session: superAdminSession,
        authority: superAuthority,
        userId: 'member-1',
        currentTenantId: 'tenant_gone',
        targetTenantId: 'tenant_gone',
      });

      expect(result).toEqual({ error: 'Unauthorized' });
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
    });

    it('rejects a request without a session authority before any tenant read', async () => {
      const result = await resolveTenantClassificationCore({
        session: adminSession,
        authority: null,
        userId: 'member-1',
        currentTenantId: 'tenant_ks',
      });

      expect(result).toEqual({ error: 'Unauthorized' });
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
    });
  });

  describe('reassign (unavailable for the pilot)', () => {
    it('rejects a super admin reassignment before any tenant read or write', async () => {
      const result = await resolveTenantClassificationCore({
        session: superAdminSession,
        authority: superAuthority,
        userId: 'member-1',
        currentTenantId: 'tenant_ks',
        targetTenantId: 'tenant_mk',
      });

      expect(result).toEqual({ error: TENANT_REASSIGNMENT_UNAVAILABLE_ERROR });
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
      expect(mocks.findFirst).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it('rejects a non-super-admin whose resolved tenant differs from the current tenant', async () => {
      // The session tenant matches currentTenantId, but the access tenant resolves elsewhere.
      const result = await resolveTenantClassificationCore({
        session: {
          user: {
            id: 'admin-1',
            role: 'tenant_admin',
            tenantId: 'tenant_ks',
            accessTenantId: 'tenant_mk',
          },
        } as never,
        authority: mintTestTenantAuthority('tenant_mk', {
          userId: 'admin-1',
          role: 'tenant_admin',
        }),
        userId: 'member-1',
        currentTenantId: 'tenant_ks',
      });

      expect(result).toEqual({ error: 'Unauthorized' });
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
    });

    it('rejects a non-super-admin naming a different target tenant', async () => {
      const result = await resolveTenantClassificationCore({
        session: adminSession,
        authority: adminAuthority,
        userId: 'member-1',
        currentTenantId: 'tenant_ks',
        targetTenantId: 'tenant_mk',
      });

      expect(result).toEqual({ error: 'Unauthorized' });
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
    });
  });

  describe('input validation', () => {
    it('rejects cross-tenant operations for non-super-admin sessions', async () => {
      const result = await resolveTenantClassificationCore({
        session: adminSession,
        authority: adminAuthority,
        userId: 'member-1',
        currentTenantId: 'tenant_mk',
      });

      expect(result).toEqual({ error: 'Unauthorized' });
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
    });

    it('requires a user id', async () => {
      const result = await resolveTenantClassificationCore({
        session: adminSession,
        authority: adminAuthority,
        userId: '  ',
        currentTenantId: 'tenant_ks',
      });

      expect(result).toEqual({ error: 'User ID is required' });
    });

    it('requires a current tenant', async () => {
      const result = await resolveTenantClassificationCore({
        session: superAdminSession,
        authority: superAuthority,
        userId: 'member-1',
        currentTenantId: ' ',
        targetTenantId: 'tenant_mk',
      });

      expect(result).toEqual({ error: 'Current tenant is required' });
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
    });
  });
});
