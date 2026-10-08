import { claims } from '@interdomestik/database/schema';
import { eq, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimsVisibilityContext } from '@/features/admin/claims/server/claimVisibility';
import { getClaimNumberResolverCore, type ClaimNumberTenantRunner } from './_core';

type WhereBuilder = (c: typeof claims, ops: { eq: typeof eq }) => SQL | undefined;

const dialect = new PgDialect();
const NUMBER = 'CLM-KS-2024-000001';
const ADMIN: ClaimsVisibilityContext = {
  tenantId: 't1',
  userId: 'u1',
  role: 'tenant_admin',
  branchId: null,
};
const MANAGER: ClaimsVisibilityContext = { ...ADMIN, role: 'branch_manager', branchId: 'b-own' };

/** Renders a single column exactly as the dialect qualifies it, so table naming is not assumed. */
function col(column: SQLWrapper): string {
  return dialect.sqlToQuery(sql`${column}`).sql;
}

function normalize(text: string): string {
  return text.replaceAll(/\s+/g, ' ').replaceAll('( ', '(').replaceAll(' )', ')').trim();
}

const ACCESS = col(claims.accessTenantId);
const HOME = col(claims.tenantId);
// Index-friendly access equality, with the home tenant consulted only when access is NULL.
const ACCESS_PREDICATE = `(${ACCESS} = $2 OR (${ACCESS} IS NULL AND ${HOME} = $3))`;

function expectedSql(withBranch = false): string {
  const branch = withBranch ? ` and ${col(claims.branchId)} = $4` : '';
  return `(${col(claims.claimNumber)} = $1 and ${ACCESS_PREDICATE}${branch})`;
}

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
    const condition = where(claims, { eq });
    expect(condition).toBeDefined();
    const query = dialect.sqlToQuery(condition as SQL);
    return { sql: normalize(query.sql), params: query.params };
  }

  it('resolves valid claim number', async () => {
    tx.query.claims.findFirst.mockResolvedValue({ id: 'c123' });
    const result = await resolve(NUMBER);
    expect(result.claimId).toBe('c123');
  });

  it('projects only the claim id', async () => {
    tx.query.claims.findFirst.mockResolvedValue({ id: 'c123' });
    await resolve(NUMBER);
    const [{ columns }] = tx.query.claims.findFirst.mock.calls[0] as [{ columns: object }];
    expect(columns).toEqual({ id: true });
  });

  it.each(['admin', 'tenant_admin', 'super_admin'])(
    'keeps %s access-tenant-wide with no branch predicate',
    async role => {
      tx.query.claims.findFirst.mockResolvedValue({ id: 'c123' });
      await resolve(NUMBER, { ...ADMIN, role });
      expect(inTenantContext).toHaveBeenCalledTimes(1);
      expect(renderedWhere()).toEqual({ sql: expectedSql(), params: [NUMBER, 't1', 't1'] });
    }
  );

  it('binds the access predicate to the visibility tenant on both branches of the OR', async () => {
    tx.query.claims.findFirst.mockResolvedValue({ id: 'c123' });
    await resolve(NUMBER, { ...ADMIN, tenantId: 'tenant_ks' });
    expect(renderedWhere().params).toEqual([NUMBER, 'tenant_ks', 'tenant_ks']);
  });

  it('consults the home tenant only when the row access tenant is NULL', async () => {
    tx.query.claims.findFirst.mockResolvedValue({ id: 'c123' });
    await resolve(NUMBER);
    const { sql: where } = renderedWhere();
    // An explicit access tenant is compared directly and never widened by a home match.
    expect(where).toContain(`${ACCESS} = $2 OR (${ACCESS} IS NULL AND ${HOME} = $3)`);
    expect(where.split(HOME)).toHaveLength(2);
    expect(where.replace(ACCESS_PREDICATE, '')).not.toContain(HOME);
    expect(where.toLowerCase()).not.toContain('coalesce');
  });

  it('normalizes an encoded lowercase number before the lookup', async () => {
    tx.query.claims.findFirst.mockResolvedValue({ id: 'c123' });
    expect((await resolve('%20clm-ks-2024-000001')).claimId).toBe('c123');
    expect(renderedWhere()).toEqual({ sql: expectedSql(), params: [NUMBER, 't1', 't1'] });
  });

  it('binds a branch manager lookup to the own branch alongside the access predicate', async () => {
    tx.query.claims.findFirst.mockResolvedValue({ id: 'c123' });
    expect((await resolve(NUMBER, MANAGER)).claimId).toBe('c123');
    const rendered = renderedWhere();
    expect(rendered).toEqual({ sql: expectedSql(true), params: [NUMBER, 't1', 't1', 'b-own'] });
    expect(rendered.params).not.toContain('b-other');
  });

  it('denies an other-branch claim the branch predicate filters out', async () => {
    tx.query.claims.findFirst.mockResolvedValue(undefined);
    expect((await resolve(NUMBER, MANAGER)).claimId).toBeNull();
    expect(renderedWhere().params).toEqual([NUMBER, 't1', 't1', 'b-own']);
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
