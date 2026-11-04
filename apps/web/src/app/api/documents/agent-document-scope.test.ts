import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { hasAgentClaimDocumentScope, type AgentScopedClaim } from './agent-document-scope';

const dialect = new PgDialect();
const claim: AgentScopedClaim = { agentId: 'agent-1', branchId: 'branch-a', ownerId: 'member-1' };

/** Returns the queued rows per select and records each select's where condition. */
function fakeDb(...results: unknown[][]) {
  const conditions: SQL[] = [];
  const select = vi.fn();
  for (const rows of results) {
    select.mockReturnValueOnce({
      from: () => ({
        where: (condition: SQL) => {
          conditions.push(condition);
          return Promise.resolve(rows);
        },
      }),
    });
  }
  return { db: { select } as never, conditions, select };
}

async function scope(db: never, overrides: Partial<AgentScopedClaim> = {}) {
  return hasAgentClaimDocumentScope({
    agentId: 'agent-1',
    claim: { ...claim, ...overrides },
    db,
    tenantId: 'tenant-ks',
  });
}

describe('hasAgentClaimDocumentScope', () => {
  it('allows an attributed claim of an active client in the agent branch', async () => {
    const { db, conditions } = fakeDb([{ branchId: 'branch-a' }], [{ id: 'link-1' }]);

    await expect(scope(db)).resolves.toBe(true);
    const agentLookup = dialect.sqlToQuery(conditions[0]);
    expect(agentLookup.params).toEqual(['agent-1', 'tenant-ks']);
    const link = dialect.sqlToQuery(conditions[1]);
    expect(link.sql).toMatch(/"tenant_id".*"agent_id".*"member_id".*"status"/);
    expect(link.params).toEqual(['tenant-ks', 'agent-1', 'member-1', 'active']);
  });

  it.each([
    ['a claim attributed to another agent', { agentId: 'agent-2' }],
    ['a claim without attribution', { agentId: null }],
    ['a claim without an owner', { ownerId: null }],
  ])('denies %s without reading the database', async (_label, overrides) => {
    const { db, select } = fakeDb();

    await expect(scope(db, overrides)).resolves.toBe(false);
    expect(select).not.toHaveBeenCalled();
  });

  it('denies an agent that is not a user of the access tenant', async () => {
    const { db, select } = fakeDb([]);

    await expect(scope(db)).resolves.toBe(false);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('denies a claim in another branch before reading client links', async () => {
    const { db, select } = fakeDb([{ branchId: 'branch-b' }]);

    await expect(scope(db)).resolves.toBe(false);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a claim without a branch', { branchId: 'branch-a' }, { branchId: null }],
    ['an agent without a branch', { branchId: null }, {}],
  ])('keeps workspace scope for %s', async (_label, agentRow, overrides) => {
    const { db } = fakeDb([agentRow], [{ id: 'link-1' }]);

    await expect(scope(db, overrides)).resolves.toBe(true);
  });

  it('denies when no active link to the claim owner exists in the tenant', async () => {
    const { db } = fakeDb([{ branchId: 'branch-a' }], []);

    await expect(scope(db)).resolves.toBe(false);
  });

  const activeLink = {
    tenant_id: 'tenant-ks',
    agent_id: 'agent-1',
    member_id: 'member-1',
    status: 'active',
  };

  it.each([
    ['an active link in the access tenant', activeLink, true],
    ['an inactive link to the claim owner', { ...activeLink, status: 'inactive' }, false],
    ['an active link held in another tenant', { ...activeLink, tenant_id: 'tenant-mk' }, false],
    ['an active link to another member', { ...activeLink, member_id: 'member-2' }, false],
  ])('applies the link condition to %s', async (_label, link, expected) => {
    await expect(scope(linkTableDb([link]))).resolves.toBe(expected);
  });
});

/** The agent row resolves; the link lookup filters the given rows by its own equality condition. */
function linkTableDb(links: Record<string, string>[]): never {
  const select = vi.fn().mockReturnValueOnce({
    from: () => ({ where: () => Promise.resolve([{ branchId: 'branch-a' }]) }),
  });
  select.mockReturnValueOnce({
    from: () => ({
      where: (condition: SQL) => {
        const { sql, params } = dialect.sqlToQuery(condition);
        const equalities = [...sql.matchAll(/"(\w+)" = \$(\d+)/g)].map(
          ([, column, index]) => [column, params[Number(index) - 1]] as const
        );
        expect(equalities.length).toBe(4);
        const rows = links.filter(row =>
          equalities.every(([column, value]) => row[column] === value)
        );
        return Promise.resolve(rows.map((_row, index) => ({ id: `link-${index}` })));
      },
    }),
  });
  return { select } as never;
}
