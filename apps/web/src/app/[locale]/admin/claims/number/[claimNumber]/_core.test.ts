import { claims } from '@interdomestik/database/schema';
import { withTenant } from '@interdomestik/database/tenant-security';
import { and, eq, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimsVisibilityContext } from '@/features/admin/claims/server/claimVisibility';
import { getClaimNumberResolverCore, type ClaimNumberTenantRunner } from './_core';

type WhereBuilder = (c: typeof claims, ops: { eq: typeof eq }) => SQL;

const dialect = new PgDialect();
const NUMBER = 'CLM-KS-2024-000001';
const ADMIN: ClaimsVisibilityContext = {
  tenantId: 't1',
  userId: 'u1',
  role: 'tenant_admin',
  branchId: null,
};
const MANAGER: ClaimsVisibilityContext = { ...ADMIN, role: 'branch_manager', branchId: 'b-own' };

describe('getClaimNumberResolverCore', () => {
  const tx = { query: { claims: { findFirst: vi.fn() } } };
  const inTenantContext = vi.fn((lookup: Parameters<ClaimNumberTenantRunner>[0]) =>
    lookup(tx as never)
  );

  beforeEach(() => vi.clearAllMocks());

  function resolve(claimNumber: string, visibility: ClaimsVisibilityContext = ADMIN) {
    return getClaimNumberResolverCore({ claimNumber, visibility, inTenantContext });
  }

  function renderedWhere() {
    const [{ where }] = tx.query.claims.findFirst.mock.calls[0] as [{ where: WhereBuilder }];
    return dialect.sqlToQuery(where(claims, { eq }));
  }

  function expectedWhere(branch?: SQL) {
    return dialect.sqlToQuery(
      withTenant('t1', claims.tenantId, and(eq(claims.claimNumber, NUMBER), branch))
    );
  }

  it('resolves valid claim number', async () => {
    tx.query.claims.findFirst.mockResolvedValue({ id: 'c123' });
    const result = await resolve(NUMBER);
    expect(result.claimId).toBe('c123');
  });

  it.each(['admin', 'tenant_admin', 'super_admin'])(
    'keeps %s tenant-wide with no branch predicate',
    async role => {
      tx.query.claims.findFirst.mockResolvedValue({ id: 'c123' });
      await resolve(NUMBER, { ...ADMIN, role });
      expect(inTenantContext).toHaveBeenCalledTimes(1);
      expect(renderedWhere()).toEqual(expectedWhere());
    }
  );

  it('normalizes an encoded lowercase number before the lookup', async () => {
    tx.query.claims.findFirst.mockResolvedValue({ id: 'c123' });
    expect((await resolve('%20clm-ks-2024-000001')).claimId).toBe('c123');
    expect(renderedWhere()).toEqual(expectedWhere());
  });

  it('binds a branch manager lookup to the own branch', async () => {
    tx.query.claims.findFirst.mockResolvedValue({ id: 'c123' });
    expect((await resolve(NUMBER, MANAGER)).claimId).toBe('c123');
    expect(renderedWhere()).toEqual(expectedWhere(eq(claims.branchId, 'b-own')));
    expect(renderedWhere()).not.toEqual(expectedWhere(eq(claims.branchId, 'b-other')));
  });

  it('denies an other-branch claim the branch predicate filters out', async () => {
    tx.query.claims.findFirst.mockResolvedValue(undefined);
    expect((await resolve(NUMBER, MANAGER)).claimId).toBeNull();
    expect(renderedWhere().params).toEqual(['t1', NUMBER, 'b-own']);
  });

  it('denies a branch manager without a branch before any lookup', async () => {
    expect((await resolve(NUMBER, { ...MANAGER, branchId: null })).claimId).toBeNull();
    expect(inTenantContext).not.toHaveBeenCalled();
  });

  it.each(['staff', 'agent', 'member', null])('denies role %s before any lookup', async role => {
    expect((await resolve(NUMBER, { ...ADMIN, role })).claimId).toBeNull();
    expect(inTenantContext).not.toHaveBeenCalled();
  });

  it('returns null for invalid format', async () => {
    const result = await resolve('INVALID');
    expect(result.claimId).toBeNull();
    expect(inTenantContext).not.toHaveBeenCalled();
  });

  it('returns null for non-existent claim', async () => {
    tx.query.claims.findFirst.mockResolvedValue(null);
    const result = await resolve('CLM-2024-999');
    expect(result.claimId).toBeNull();
  });

  it('returns null when the scoped lookup finds no claim', async () => {
    tx.query.claims.findFirst.mockResolvedValue(undefined);
    expect((await resolve(NUMBER)).claimId).toBeNull();
    expect(tx.query.claims.findFirst).toHaveBeenCalledTimes(1);
  });

  it('fails closed on a malformed percent escape without a lookup', async () => {
    expect((await resolve('CLM-KS-2024-%E0%A4%A')).claimId).toBeNull();
    expect(inTenantContext).not.toHaveBeenCalled();
  });

  it('propagates unexpected lookup failures', async () => {
    tx.query.claims.findFirst.mockRejectedValueOnce(new Error('connection terminated'));
    await expect(resolve(NUMBER)).rejects.toThrow('connection terminated');
  });
});
