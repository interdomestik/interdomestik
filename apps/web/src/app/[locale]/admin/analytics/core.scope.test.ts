import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  session: vi.fn(),
  select: vi.fn(),
  grants: vi.fn(),
  predicates: [] as SQL[],
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: state.session } } }));
vi.mock('@/server/auth/effective-portal-access', () => ({
  hasEffectivePortalAccess: state.grants,
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(
    async (_authority: unknown, run: (tx: { select: typeof state.select }) => unknown) =>
      run({ select: state.select })
  ),
}));

import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { getAdminAnalyticsDataCore } from './_core';

async function authorityFor(role: string, branchId: string | null = null) {
  state.session.mockResolvedValue({ user: { id: 'u1', tenantId: 'tenant-1', role, branchId } });
  const authorized = await authorizeSessionTenant(new Headers());
  if (!authorized) throw new Error('Expected session authority');
  return authorized.authority;
}

describe('admin analytics query scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.grants.mockResolvedValue(false);
    state.predicates = [];
    const results = [
      [{ sum: 100, avg: 50, count: 2 }],
      [{ status: 'resolved', count: 1 }],
      [{ category: 'vehicle', count: 2 }],
      [{ count: 1 }],
    ];
    state.select.mockImplementation(() => {
      const rows = results.shift();
      const builder = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn((predicate: SQL) => {
          state.predicates.push(predicate);
          return builder;
        }),
        groupBy: vi.fn().mockReturnThis(),
        then: (resolve: (value: unknown) => unknown) => resolve(rows),
      };
      return builder;
    });
  });

  it.each(['branch-a', 'branch-b'])(
    'scopes every aggregate to the authenticated branch %s',
    async branchId => {
      const result = await getAdminAnalyticsDataCore(
        await authorityFor('branch_manager', branchId)
      );
      expect(result).toMatchObject({ totals: { count: 2 }, activeClaimants: 1, successRate: 50 });
      expect(state.predicates).toHaveLength(4);
      for (const predicate of state.predicates) {
        const query = new PgDialect().sqlToQuery(predicate);
        expect(query.sql).toContain('"claim"."tenant_id"');
        expect(query.sql).toContain('"claim"."branch_id"');
        expect(query.params).toEqual(['tenant-1', branchId]);
      }
    }
  );

  it.each(['super_admin', 'tenant_admin', 'admin'])(
    'keeps %s aggregates tenant scoped',
    async role => {
      await getAdminAnalyticsDataCore(await authorityFor(role, 'branch-a'));
      expect(state.predicates).toHaveLength(4);
      for (const predicate of state.predicates) {
        const query = new PgDialect().sqlToQuery(predicate);
        expect(query.sql).toContain('"claim"."tenant_id"');
        expect(query.sql).not.toContain('"claim"."branch_id"');
        expect(query.params).toEqual(['tenant-1']);
      }
    }
  );

  it.each([null, '', '   '])(
    'refuses a manager with missing branch %j before querying',
    async branchId => {
      await expect(
        getAdminAnalyticsDataCore(await authorityFor('branch_manager', branchId))
      ).rejects.toThrow('Unauthorized');
      expect(state.select).not.toHaveBeenCalled();
    }
  );

  it.each(['staff', 'agent', 'member', 'unknown'])('refuses %s before querying', async role => {
    await expect(getAdminAnalyticsDataCore(await authorityFor(role, 'branch-a'))).rejects.toThrow(
      'Unauthorized'
    );
    expect(state.select).not.toHaveBeenCalled();
  });

  it('refuses an authority without an authenticated principal', async () => {
    await expect(getAdminAnalyticsDataCore(mintTestTenantAuthority('tenant-1'))).rejects.toThrow(
      'Unauthorized'
    );
    expect(state.select).not.toHaveBeenCalled();
  });

  it.each(['staff', 'agent'])('preserves an explicit tenant-admin grant for %s', async role => {
    state.grants.mockResolvedValue(true);
    await getAdminAnalyticsDataCore(await authorityFor(role, 'branch-a'));
    expect(state.predicates).toHaveLength(4);
    expect(state.grants).toHaveBeenCalledWith({ user: { id: 'u1', tenantId: 'tenant-1', role } }, [
      'admin',
      'tenant_admin',
      'super_admin',
    ]);
    for (const predicate of state.predicates) {
      expect(new PgDialect().sqlToQuery(predicate).params).toEqual(['tenant-1']);
    }
  });

  it.each(['branch_manager', 'member'])(
    'never uses tenant grants to widen %s scope',
    async role => {
      state.grants.mockResolvedValue(true);
      await expect(getAdminAnalyticsDataCore(await authorityFor(role))).rejects.toThrow(
        'Unauthorized'
      );
      expect(state.grants).not.toHaveBeenCalled();
      expect(state.select).not.toHaveBeenCalled();
    }
  );

  it('fails closed before queries if grant resolution fails', async () => {
    state.grants.mockRejectedValue(new Error('Grant lookup unavailable'));
    await expect(getAdminAnalyticsDataCore(await authorityFor('staff'))).rejects.toThrow(
      'Unauthorized'
    );
    expect(state.select).not.toHaveBeenCalled();
  });
});
