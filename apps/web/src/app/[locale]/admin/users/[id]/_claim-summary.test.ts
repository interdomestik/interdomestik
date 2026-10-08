import { claims } from '@interdomestik/database/schema';
import { resolveClaimLifecycleReadProjection } from '@interdomestik/domain-claims';
import { claimLifecycleStatusSql } from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import { getAdminUserClaimSummary, type AdminUserClaimSummaryScope } from './_claim-summary';

const dialect = new PgDialect();

type ClaimRow = {
  id: string;
  title: string;
  caseLifecycleState: null;
  recoveryLifecycleState: null;
  claimAmount: string;
  currency: string;
  createdAt: Date;
};

function claimRow(id: string, createdAt: string): ClaimRow {
  return {
    id,
    title: `Claim ${id}`,
    caseLifecycleState: null,
    recoveryLifecycleState: null,
    claimAmount: '100.00',
    currency: 'EUR',
    createdAt: new Date(createdAt),
  };
}

// Same member: claim A lives in branch A, claim B in branch B. Rows are scripted per scenario;
// the database semantics of the branch predicate are proven by the real Postgres integration lane.
const CLAIM_A = claimRow('claim-A', '2026-09-02T00:00:00Z');
const CLAIM_B = claimRow('claim-B', '2026-09-01T00:00:00Z');

type Rows = readonly unknown[] | Error;

type QueryCall = {
  fields: Record<string, unknown>;
  from?: unknown;
  where?: SQL;
  groupBy?: SQL[];
  orderBy?: SQL[];
  limit?: number;
};

function settle(rows: Rows): Promise<readonly unknown[]> {
  return rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows);
}

function createDb(counts: Rows, recent: Rows) {
  const calls: QueryCall[] = [];
  const select = vi.fn((fields: Record<string, unknown>) => {
    const call: QueryCall = { fields };
    calls.push(call);
    const builder = {
      from(table: unknown) {
        call.from = table;
        return builder;
      },
      where(condition: SQL) {
        call.where = condition;
        return builder;
      },
      groupBy(...columns: SQL[]) {
        call.groupBy = columns;
        return settle(counts);
      },
      orderBy(...columns: SQL[]) {
        call.orderBy = columns;
        return builder;
      },
      limit(limit: number) {
        call.limit = limit;
        return settle(recent);
      },
    };
    return builder;
  });
  return { db: { select } as never, calls };
}

function run(scope: AdminUserClaimSummaryScope, counts: Rows, recent: Rows) {
  const { db, calls } = createDb(counts, recent);
  const pending = getAdminUserClaimSummary({
    db,
    recentClaimsLimit: 6,
    scope,
    tenantId: 't1',
    userId: 'u1',
  });
  return { calls, pending };
}

async function summarize(scope: AdminUserClaimSummaryScope, counts: Rows, recent: Rows) {
  const { calls, pending } = run(scope, counts, recent);
  const result = await pending;
  const [countQuery, recentQuery] = calls;
  return { result, countQuery, recentQuery };
}

function compile(condition: SQL | undefined) {
  return dialect.sqlToQuery(condition!);
}

function expectedWhere(branch?: SQL) {
  return compile(and(eq(claims.userId, 'u1'), eq(claims.tenantId, 't1'), branch));
}

function projected(row: ClaimRow) {
  const input = row as unknown as Parameters<typeof resolveClaimLifecycleReadProjection>[0];
  return { ...row, status: resolveClaimLifecycleReadProjection(input).status };
}

describe('getAdminUserClaimSummary actor scope', () => {
  it('limits both queries to the own branch for a branch manager', async () => {
    const { result, countQuery, recentQuery } = await summarize(
      { role: 'branch_manager', branchId: 'b-A' },
      [{ status: 'open', total: 1 }],
      [CLAIM_A]
    );

    const expected = expectedWhere(eq(claims.branchId, 'b-A'));
    for (const query of [countQuery, recentQuery]) {
      const where = compile(query.where);
      expect(where).toEqual(expected);
      expect(where.sql).toContain('"claim"."branch_id" = $3');
      expect(where.params).toEqual(['u1', 't1', 'b-A']);
    }
    expect(result.counts).toEqual({ total: 1, open: 1, resolved: 0, rejected: 0 });
    expect(result.recentClaims).toEqual([projected(CLAIM_A)]);
  });

  it.each(['admin', 'tenant_admin', 'super_admin'])(
    'keeps tenant-wide member claims for %s',
    async role => {
      const { result, countQuery, recentQuery } = await summarize(
        { role, branchId: null },
        [
          { status: 'resolved', total: 1 },
          { status: 'open', total: '1' },
        ],
        [CLAIM_A, CLAIM_B]
      );

      for (const query of [countQuery, recentQuery]) {
        const where = compile(query.where);
        expect(where).toEqual(expectedWhere());
        expect(where.sql).not.toContain('branch_id');
        expect(where.params).toEqual(['u1', 't1']);
      }
      expect(result.counts).toEqual({ total: 2, open: 1, resolved: 1, rejected: 0 });
      expect(result.recentClaims.map(claim => claim.id)).toEqual(['claim-A', 'claim-B']);
    }
  );

  it.each([null, ''])(
    'denies all claims for a branch manager with branch %j instead of widening',
    async branchId => {
      const { result, countQuery, recentQuery } = await summarize(
        { role: 'branch_manager', branchId },
        [],
        []
      );

      for (const query of [countQuery, recentQuery]) {
        const where = compile(query.where);
        expect(where).toEqual(expectedWhere(sql`false`));
        expect(where.sql).toContain('false');
        expect(where.sql).not.toContain('branch_id');
      }
      expect(result).toEqual({
        counts: { total: 0, open: 0, resolved: 0, rejected: 0 },
        recentClaims: [],
      });
    }
  );

  it('preserves aggregate grouping, projection fields, order and limit', async () => {
    const { countQuery, recentQuery } = await summarize(
      { role: 'branch_manager', branchId: 'b-A' },
      [],
      []
    );

    expect(countQuery.from).toBe(claims);
    expect(Object.keys(countQuery.fields)).toEqual(['status', 'total']);
    expect(countQuery.groupBy?.map(compile)).toEqual([compile(claimLifecycleStatusSql())]);

    expect(recentQuery.from).toBe(claims);
    expect(Object.keys(recentQuery.fields)).toEqual([
      'id',
      'title',
      'caseLifecycleState',
      'recoveryLifecycleState',
      'claimAmount',
      'currency',
      'createdAt',
    ]);
    expect(recentQuery.orderBy?.map(compile)).toEqual([compile(desc(claims.createdAt))]);
    expect(recentQuery.limit).toBe(6);
  });

  it.each([
    ['count', new Error('count failed'), []],
    ['recent', [], new Error('recent failed')],
  ] as const)('propagates %s query failures', async (_label, counts, recent) => {
    const failure = counts instanceof Error ? counts : recent;
    const { pending } = run({ role: 'admin', branchId: null }, counts, recent);
    await expect(pending).rejects.toBe(failure);
  });
});
