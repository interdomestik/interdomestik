import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockTenantSession = { user: { accessTenantId?: string | null; tenantId?: string | null } };

const mocks = vi.hoisted(() => {
  const accessTenantOf = ({ user }: MockTenantSession) =>
    user.accessTenantId?.trim() || user.tenantId?.trim();
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const findFirst = vi.fn();
  const tx = { update, query: { user: { findFirst } } };

  return {
    returning,
    where,
    set,
    update,
    findFirst,
    tx,
    withTenantContext: vi.fn(),
    moveUserTenantClassification: vi.fn(),
    user: {
      id: 'user.id',
      tenantId: 'user.tenantId',
      tenantClassificationPending: 'user.tenantClassificationPending',
    },
    eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
    withTenant: vi.fn((tenantId: string, tenantColumn: unknown, filter: unknown) => ({
      op: 'withTenant',
      tenantId,
      tenantColumn,
      filter,
    })),
    ensureAccessTenantId: vi.fn(accessTenantOf),
    // The session's own tenant (not the access tenant), as the real helper reads it.
    ensureTenantId: vi.fn(({ user }: MockTenantSession) => user.tenantId?.trim()),
  };
});

vi.mock('@interdomestik/database', () => ({
  user: mocks.user,
  eq: mocks.eq,
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('@interdomestik/database/tenant-classification-move', () => ({
  moveUserTenantClassification: mocks.moveUserTenantClassification,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureAccessTenantId: mocks.ensureAccessTenantId,
  ensureTenantId: mocks.ensureTenantId,
}));

vi.mock('./access', () => ({
  requireTenantAdminSession: vi.fn(async (session: unknown) => session),
}));

import { resolveTenantClassificationCore } from './resolve-tenant-classification';

const adminSession = {
  user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant_ks' },
} as never;

const superAdminSession = {
  user: { id: 'super-1', role: 'super_admin', tenantId: 'tenant_ks' },
} as never;

describe('resolveTenantClassificationCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mocks.withTenantContext.mockImplementation(
      async (_ctx: unknown, callback: (tx: unknown) => unknown) => callback(mocks.tx)
    );
    mocks.findFirst.mockResolvedValue({ id: 'member-1', tenantClassificationPending: true });
    mocks.returning.mockResolvedValue([{ id: 'member-1' }]);
    mocks.moveUserTenantClassification.mockResolvedValue({
      outcome: 'moved',
      previousPending: true,
    });
  });

  describe('confirm_current', () => {
    it('confirms the current tenant and clears pending inside that tenant context', async () => {
      const result = await resolveTenantClassificationCore({
        session: adminSession,
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
      expect(mocks.withTenantContext.mock.calls[0][0]).toEqual({ tenantId: 'tenant_ks' });
      expect(mocks.set).toHaveBeenCalledWith({ tenantClassificationPending: false });
      expect(mocks.withTenant).toHaveBeenCalledWith(
        'tenant_ks',
        'user.tenantId',
        expect.anything()
      );
      expect(mocks.moveUserTenantClassification).not.toHaveBeenCalled();
    });

    it('reports previousPending false for an already-resolved user', async () => {
      mocks.findFirst.mockResolvedValue({ id: 'member-1', tenantClassificationPending: false });

      const result = await resolveTenantClassificationCore({
        session: adminSession,
        userId: 'member-1',
        currentTenantId: 'tenant_ks',
      });

      expect(result).toMatchObject({ success: true, data: { previousPending: false } });
    });

    it('returns User not found, without updating, when the user is not in the tenant', async () => {
      mocks.findFirst.mockResolvedValue(undefined);

      const result = await resolveTenantClassificationCore({
        session: adminSession,
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
        userId: 'member-1',
        currentTenantId: 'tenant_ks',
      });

      expect(result).toEqual({ error: 'User not found' });
    });

    it('lets a super admin confirm a non-session current tenant under that tenant context', async () => {
      const result = await resolveTenantClassificationCore({
        session: superAdminSession,
        userId: 'member-1',
        currentTenantId: 'tenant_mk',
        targetTenantId: 'tenant_mk',
      });

      expect(result).toMatchObject({
        success: true,
        data: { previousTenantId: 'tenant_mk', tenantId: 'tenant_mk' },
      });
      expect(mocks.withTenantContext.mock.calls[0][0]).toEqual({ tenantId: 'tenant_mk' });
    });
  });

  describe('reassign', () => {
    it('moves the user for a super admin and returns the move result', async () => {
      const result = await resolveTenantClassificationCore({
        session: superAdminSession,
        userId: 'member-1',
        currentTenantId: 'tenant_ks',
        targetTenantId: 'tenant_mk',
      });

      expect(result).toEqual({
        success: true,
        data: {
          previousTenantId: 'tenant_ks',
          tenantId: 'tenant_mk',
          previousPending: true,
          tenantClassificationPending: false,
          resolutionMode: 'reassign',
        },
      });
      expect(mocks.moveUserTenantClassification).toHaveBeenCalledTimes(1);
      expect(mocks.moveUserTenantClassification).toHaveBeenCalledWith({
        userId: 'member-1',
        fromTenantId: 'tenant_ks',
        toTenantId: 'tenant_mk',
      });
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
    });

    it('propagates previousPending false from the move', async () => {
      mocks.moveUserTenantClassification.mockResolvedValue({
        outcome: 'moved',
        previousPending: false,
      });

      const result = await resolveTenantClassificationCore({
        session: superAdminSession,
        userId: 'member-1',
        currentTenantId: 'tenant_ks',
        targetTenantId: 'tenant_mk',
      });

      expect(result).toMatchObject({ success: true, data: { previousPending: false } });
    });

    it.each([
      ['user_not_found', 'User not found'],
      ['target_tenant_not_found', 'Target tenant not found'],
      [
        'tenant_bound_records_exist',
        'Cannot reassign tenant classification while tenant-bound records exist',
      ],
    ])('maps the %s outcome to the %s error', async (outcome, error) => {
      mocks.moveUserTenantClassification.mockResolvedValue({ outcome });

      const result = await resolveTenantClassificationCore({
        session: superAdminSession,
        userId: 'member-1',
        currentTenantId: 'tenant_ks',
        targetTenantId: 'tenant_mk',
      });

      expect(result).toEqual({ error });
    });

    it('returns a generic error when the move throws', async () => {
      mocks.moveUserTenantClassification.mockRejectedValue(new Error('db down'));

      const result = await resolveTenantClassificationCore({
        session: superAdminSession,
        userId: 'member-1',
        currentTenantId: 'tenant_ks',
        targetTenantId: 'tenant_mk',
      });

      expect(result).toEqual({ error: 'Failed to resolve tenant classification' });
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
        userId: 'member-1',
        currentTenantId: 'tenant_ks',
      });

      expect(result).toEqual({ error: 'Unauthorized' });
      expect(mocks.moveUserTenantClassification).not.toHaveBeenCalled();
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
    });

    it('rejects a non-super-admin naming a different target tenant', async () => {
      const result = await resolveTenantClassificationCore({
        session: adminSession,
        userId: 'member-1',
        currentTenantId: 'tenant_ks',
        targetTenantId: 'tenant_mk',
      });

      expect(result).toEqual({ error: 'Unauthorized' });
      expect(mocks.moveUserTenantClassification).not.toHaveBeenCalled();
    });
  });

  describe('input validation', () => {
    it('rejects cross-tenant operations for non-super-admin sessions', async () => {
      const result = await resolveTenantClassificationCore({
        session: adminSession,
        userId: 'member-1',
        currentTenantId: 'tenant_mk',
      });

      expect(result).toEqual({ error: 'Unauthorized' });
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
      expect(mocks.moveUserTenantClassification).not.toHaveBeenCalled();
    });

    it('requires a user id', async () => {
      const result = await resolveTenantClassificationCore({
        session: adminSession,
        userId: '  ',
        currentTenantId: 'tenant_ks',
      });

      expect(result).toEqual({ error: 'User ID is required' });
    });

    it('requires a current tenant', async () => {
      const result = await resolveTenantClassificationCore({
        session: superAdminSession,
        userId: 'member-1',
        currentTenantId: ' ',
        targetTenantId: 'tenant_mk',
      });

      expect(result).toEqual({ error: 'Current tenant is required' });
      expect(mocks.moveUserTenantClassification).not.toHaveBeenCalled();
    });
  });
});
