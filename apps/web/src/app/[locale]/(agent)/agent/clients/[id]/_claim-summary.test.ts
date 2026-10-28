import { claimLifecycleFieldsForStatus } from '@interdomestik/database/claim-lifecycle';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { claims } from '@interdomestik/database/schema';
import { desc, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  ambientSelect: vi.fn(),
  withTenantContext: vi.fn(),
}));

// The lifecycle SQL helper imports `claims` from the database barrel, so the barrel mock must
// expose the actual schema tables rather than only helper functions.
vi.mock('@interdomestik/database', async () => {
  const schema = await vi.importActual<Record<string, unknown>>('@interdomestik/database/schema');
  return { ...schema, withTenantContext: hoisted.withTenantContext };
});
vi.mock('@interdomestik/database/db', () => {
  const ambient = { select: hoisted.ambientSelect };
  return { db: ambient, dbAdmin: ambient };
});

import { getAgentClientClaimSummary } from './_claim-summary';

const dialect = new PgDialect();
const toQuery = (value: unknown) => dialect.sqlToQuery(value as SQL);

type Captured = {
  fields: Record<string, unknown>[];
  from: unknown[];
  where: unknown[];
  groupBy: unknown[];
  orderBy: unknown[];
  limit: number[];
};

const settle = (value: unknown) =>
  value instanceof Error ? Promise.reject(value) : Promise.resolve(value);

function createTx(countRows: unknown[] | Error, recentRows: unknown[] | Error) {
  const captured: Captured = {
    fields: [],
    from: [],
    where: [],
    groupBy: [],
    orderBy: [],
    limit: [],
  };
  const select = (fields: Record<string, unknown>) => {
    captured.fields.push(fields);
    const chain = {
      from: (table: unknown) => {
        captured.from.push(table);
        return chain;
      },
      where: (where: unknown) => {
        captured.where.push(where);
        return chain;
      },
      groupBy: (group: unknown) => {
        captured.groupBy.push(group);
        return settle(countRows);
      },
      orderBy: (order: unknown) => {
        captured.orderBy.push(order);
        return chain;
      },
      limit: (limit: number) => {
        captured.limit.push(limit);
        return settle(recentRows);
      },
    };
    return chain;
  };
  const tx = { select } as unknown as Parameters<typeof getAgentClientClaimSummary>[0];
  return { tx, captured };
}

const lifecycleRow = (id: string, status: ClaimStatus) => ({
  id,
  ...claimLifecycleFieldsForStatus(status),
});

describe('getAgentClientClaimSummary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('reads counts and recent claims only through the supplied transaction', async () => {
    const { tx, captured } = createTx([], []);

    await getAgentClientClaimSummary(tx, 'm1', 'tenant_ks');

    expect(captured.fields).toHaveLength(2);
    expect(Object.keys(captured.fields[0])).toEqual(['status', 'total']);
    expect(Object.keys(captured.fields[1])).toEqual([
      'id',
      'caseLifecycleState',
      'recoveryLifecycleState',
    ]);
    expect(captured.from).toEqual([claims, claims]);
    for (const where of captured.where) {
      expect(toQuery(where).params).toEqual(['m1', 'tenant_ks']);
    }
    expect(hoisted.ambientSelect).not.toHaveBeenCalled();
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it('groups by the exact lifecycle status SQL and orders recent claims by createdAt desc, limit 6', async () => {
    const { tx, captured } = createTx([], []);

    await getAgentClientClaimSummary(tx, 'm1', 'tenant_ks');

    const groupSql = toQuery(captured.groupBy[0]).sql;
    expect(groupSql).toContain('case_lifecycle_state');
    expect(groupSql).toContain('recovery_lifecycle_state');
    expect(groupSql).toContain("then 'draft'");
    expect(groupSql).toContain("then 'rejected'");
    expect(toQuery(captured.fields[0].status).sql).toBe(groupSql);
    expect(toQuery(captured.orderBy[0]).sql).toBe(toQuery(desc(claims.createdAt)).sql);
    expect(captured.limit).toEqual([6]);
  });

  it('counts every status category, folding draft and active statuses into open', async () => {
    const { tx } = createTx(
      [
        { status: 'draft', total: 1 },
        { status: 'submitted', total: 2 },
        { status: 'submitted_to_airline', total: '1' },
        { status: 'verification', total: 1 },
        { status: 'evaluation', total: 1 },
        { status: 'negotiation', total: 1 },
        { status: 'court', total: 1 },
        { status: 'resolved', total: 3 },
        { status: 'rejected', total: 2 },
      ],
      []
    );

    const res = await getAgentClientClaimSummary(tx, 'm1', 'tenant_ks');

    expect(res.claimCounts).toEqual({ total: 13, open: 8, resolved: 3, rejected: 2 });
  });

  it('maps the six most recent lifecycle pairs in database order', async () => {
    const statuses: ClaimStatus[] = [
      'draft',
      'submitted',
      'submitted_to_airline',
      'negotiation',
      'resolved',
      'rejected',
    ];
    const { tx } = createTx(
      [],
      statuses.map((status, index) => lifecycleRow(`c${index + 1}`, status))
    );

    const res = await getAgentClientClaimSummary(tx, 'm1', 'tenant_ks');

    expect(res.recentClaims).toEqual(
      statuses.map((status, index) => ({ id: `c${index + 1}`, status }))
    );
  });

  it('returns zero counts and no recent claims for a member without claims', async () => {
    const { tx } = createTx([], []);

    const res = await getAgentClientClaimSummary(tx, 'm1', 'tenant_ks');

    expect(res).toEqual({
      claimCounts: { total: 0, open: 0, resolved: 0, rejected: 0 },
      recentClaims: [],
    });
  });

  it('propagates count and recent query failures', async () => {
    const countFailure = new Error('count failed');
    await expect(
      getAgentClientClaimSummary(createTx(countFailure, []).tx, 'm1', 'tenant_ks')
    ).rejects.toBe(countFailure);

    const recentFailure = new Error('recent failed');
    await expect(
      getAgentClientClaimSummary(createTx([], recentFailure).tx, 'm1', 'tenant_ks')
    ).rejects.toBe(recentFailure);
  });
});
