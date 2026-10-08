import { describe, expect, it } from 'vitest';
import {
  hoisted,
  ADMIN_CONTEXT,
  mockQueryResults,
  expectOk,
  expectReadFailed,
  mainConditionArgs,
} from './__tests__/admin-claims-query-fixtures';
import { getAdminClaimsV2 } from './getAdminClaimsV2';

describe('getAdminClaimsV2', () => {
  describe('role scoping', () => {
    it.each(['admin', 'tenant_admin', 'super_admin'])(
      'adds no branch or assignment condition for %s',
      async role => {
        mockQueryResults([], 0);

        await getAdminClaimsV2({ ...ADMIN_CONTEXT, role, branchId: 'branch-1' });

        expect(mainConditionArgs()).toEqual(['eq:claims.tenantId:tenant-A']);
      }
    );

    it('limits a branch manager to the tenant and own branch for list, count and stats', async () => {
      const context = {
        tenantId: 'tenant-A',
        userId: 'manager-1',
        role: 'branch_manager',
        branchId: 'branch-1',
      };
      mockQueryResults([], 0);

      expectOk(await getAdminClaimsV2(context));

      expect(hoisted.withTenantContext.mock.calls[0]?.[0]).toStrictEqual({
        tenantId: 'tenant-A',
        role: 'branch_manager',
      });
      expect(mainConditionArgs()).toEqual([
        'eq:claims.tenantId:tenant-A',
        'eq:claims.branchId:branch-1',
      ]);
      expect(hoisted.countQuery.where.mock.calls[0]?.[0]).toEqual(
        hoisted.mainQuery.where.mock.calls[0]?.[0]
      );
      // Stats scope is derived from the same context inside the same transaction.
      expect(hoisted.readAdminClaimStats.mock.calls[0]?.[0]).toBe(hoisted.tx);
      expect(hoisted.readAdminClaimStats.mock.calls[0]?.[1]).toEqual(context);
    });

    it.each([null, ''])(
      'denies all rows for a branch manager with branchId %j instead of widening to the tenant',
      async branchId => {
        mockQueryResults([], 0);

        expectOk(await getAdminClaimsV2({ ...ADMIN_CONTEXT, role: 'branch_manager', branchId }));

        expect(mainConditionArgs()).toEqual([
          'eq:claims.tenantId:tenant-A',
          { type: 'sql', text: 'false' },
        ]);
        expect(hoisted.countQuery.where.mock.calls[0]?.[0]).toEqual(
          hoisted.mainQuery.where.mock.calls[0]?.[0]
        );
      }
    );

    it('keeps the staff branch-or-assignee condition when the staff member has a branch', async () => {
      mockQueryResults([], 0);

      await getAdminClaimsV2({
        tenantId: 'tenant-A',
        userId: 'staff-1',
        role: 'staff',
        branchId: 'branch-1',
      });

      expect(mainConditionArgs()).toEqual([
        'eq:claims.tenantId:tenant-A',
        {
          type: 'or',
          args: ['eq:claims.branchId:branch-1', 'eq:claims.staffId:staff-1'],
        },
      ]);
    });

    it('keeps the staff assignee-only condition when the staff member has no branch', async () => {
      mockQueryResults([], 0);

      await getAdminClaimsV2({
        tenantId: 'tenant-A',
        userId: 'staff-1',
        role: 'staff',
        branchId: null,
      });

      expect(mainConditionArgs()).toEqual([
        'eq:claims.tenantId:tenant-A',
        'eq:claims.staffId:staff-1',
      ]);
    });
  });

  describe('read failures', () => {
    it('returns the typed error and reports when the rows read fails, with no later reads', async () => {
      const failure = mockQueryResults([{ claim: { id: 'claim-1' } }], 1, { failAt: 'rows' });

      expectReadFailed(await getAdminClaimsV2(ADMIN_CONTEXT));

      expect(hoisted.txSelect).toHaveBeenCalledTimes(1);
      expect(hoisted.historyQuery.orderBy).not.toHaveBeenCalled();
      expect(hoisted.readAdminClaimStats).not.toHaveBeenCalled();
      expect(hoisted.countQuery.where).not.toHaveBeenCalled();
      expect(hoisted.mapClaimsToOperationalRows).not.toHaveBeenCalled();
      expect(hoisted.captureException).toHaveBeenCalledWith(failure, {
        extra: { tenantId: 'tenant-A', action: 'getAdminClaimsV2' },
      });
    });

    it('returns the typed error when the history read fails, with no stats or count reads', async () => {
      const failure = mockQueryResults([{ claim: { id: 'claim-1' } }], 1, { failAt: 'history' });

      expectReadFailed(await getAdminClaimsV2(ADMIN_CONTEXT));

      expect(hoisted.txSelect).toHaveBeenCalledTimes(2);
      expect(hoisted.readAdminClaimStats).not.toHaveBeenCalled();
      expect(hoisted.countQuery.where).not.toHaveBeenCalled();
      expect(hoisted.mapClaimsToOperationalRows).not.toHaveBeenCalled();
      expect(hoisted.captureException).toHaveBeenCalledWith(failure, {
        extra: { tenantId: 'tenant-A', action: 'getAdminClaimsV2' },
      });
    });

    it('returns the typed error when the stats read fails, not zero counts, with no count read', async () => {
      const failure = mockQueryResults([{ claim: { id: 'claim-1' } }], 1, { failAt: 'stats' });

      expectReadFailed(await getAdminClaimsV2(ADMIN_CONTEXT));

      expect(hoisted.readAdminClaimStats).toHaveBeenCalledTimes(1);
      expect(hoisted.countQuery.where).not.toHaveBeenCalled();
      expect(hoisted.captureException).toHaveBeenCalledWith(failure, {
        extra: { tenantId: 'tenant-A', action: 'getAdminClaimsV2' },
      });
    });

    it('returns the typed error when the stats read fails on an empty page', async () => {
      mockQueryResults([], 0, { failAt: 'stats' });

      expectReadFailed(await getAdminClaimsV2(ADMIN_CONTEXT));

      expect(hoisted.readAdminClaimStats).toHaveBeenCalledTimes(1);
      expect(hoisted.countQuery.where).not.toHaveBeenCalled();
    });

    it('returns the typed error when the count read fails, not an empty page', async () => {
      const failure = mockQueryResults([{ claim: { id: 'claim-1' } }], 1, { failAt: 'count' });

      expectReadFailed(await getAdminClaimsV2(ADMIN_CONTEXT));

      expect(hoisted.txSelect).toHaveBeenCalledTimes(3);
      expect(hoisted.readAdminClaimStats).toHaveBeenCalledTimes(1);
      expect(hoisted.captureException).toHaveBeenCalledWith(failure, {
        extra: { tenantId: 'tenant-A', action: 'getAdminClaimsV2' },
      });
    });

    it('returns the typed error when the tenant transaction cannot be opened', async () => {
      const failure = new Error('connection refused');
      hoisted.withTenantContext.mockRejectedValue(failure);

      expectReadFailed(await getAdminClaimsV2(ADMIN_CONTEXT));

      expect(hoisted.txSelect).not.toHaveBeenCalled();
      expect(hoisted.readAdminClaimStats).not.toHaveBeenCalled();
      expect(hoisted.captureException).toHaveBeenCalledWith(failure, {
        extra: { tenantId: 'tenant-A', action: 'getAdminClaimsV2' },
      });
    });
  });
});
