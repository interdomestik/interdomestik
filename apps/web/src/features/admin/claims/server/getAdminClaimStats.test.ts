import type { TenantTransaction } from '@interdomestik/database';
import { claims } from '@interdomestik/database/schema';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  withTenantContext: vi.fn(),
  captureException: vi.fn(),
}));

// The package index opens database clients; keep the real schema (and therefore real SQL)
// but replace the tenant transaction boundary.
vi.mock('@interdomestik/database', async () => {
  const schema = await vi.importActual<typeof import('@interdomestik/database/schema')>(
    '@interdomestik/database/schema'
  );
  return { claims: schema.claims, withTenantContext: hoisted.withTenantContext };
});

vi.mock('@sentry/nextjs', () => ({
  captureException: hoisted.captureException,
}));

import type { ClaimsVisibilityContext } from './claimVisibility';
import { getAdminClaimStats, readAdminClaimStats } from './getAdminClaimStats';

const dialect = new PgDialect();

const ZERO_STATS = {
  intake: 0,
  verification: 0,
  processing: 0,
  negotiation: 0,
  legal: 0,
  completed: 0,
};

const STAGE_STATUSES = {
  intake: ['draft', 'submitted'],
  verification: ['verification'],
  processing: ['evaluation'],
  negotiation: ['negotiation'],
  legal: ['court'],
  completed: ['resolved', 'rejected'],
};

// Effective access tenant: explicit access wins; home tenant only when access IS NULL.
const ACCESS_TENANT_SQL =
  '( "claim"."access_tenant_id" = $1 OR ("claim"."access_tenant_id" IS NULL AND "claim"."tenant_id" = $2) )';

function createContext(overrides: Partial<ClaimsVisibilityContext> = {}): ClaimsVisibilityContext {
  return {
    tenantId: 'tenant-A',
    userId: 'user-1',
    role: 'admin',
    branchId: null,
    ...overrides,
  };
}

/**
 * Minimal transaction double for `select(fields).from(table).where(condition)`.
 * `outcome` is the awaited result of the where step, or an error thrown when it is awaited.
 */
function createTx(outcome: unknown[] | Error = [{}]) {
  const where = vi.fn(async (_condition: unknown) => {
    if (outcome instanceof Error) {
      throw outcome;
    }
    return outcome;
  });
  const from = vi.fn((_table: unknown) => ({ where }));
  const select = vi.fn((_fields: unknown) => ({ from }));
  return { tx: { select } as unknown as TenantTransaction, select, from, where };
}

function compile(query: SQL | undefined) {
  expect(query).toBeDefined();
  return dialect.sqlToQuery(query as SQL);
}

function capturedCondition(where: ReturnType<typeof createTx>['where']) {
  expect(where).toHaveBeenCalledTimes(1);
  const compiled = compile(where.mock.calls[0]?.[0] as SQL | undefined);
  return { sql: compiled.sql.replace(/\s+/g, ' '), params: compiled.params };
}

describe('readAdminClaimStats', () => {
  it('reads one aggregate over claims and returns the lifecycle DTO unchanged in shape', async () => {
    const { tx, select, from } = createTx([
      { intake: 3, verification: 2, processing: 1, negotiation: 4, legal: 5, completed: 6 },
    ]);

    await expect(readAdminClaimStats(tx, createContext())).resolves.toStrictEqual({
      intake: 3,
      verification: 2,
      processing: 1,
      negotiation: 4,
      legal: 5,
      completed: 6,
    });

    expect(select).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith(claims);
  });

  it('normalizes driver values to numbers and treats missing counts as zero', async () => {
    const { tx } = createTx([
      {
        intake: '3',
        verification: '0',
        processing: 4,
        negotiation: undefined,
        legal: null,
        completed: '7',
      },
    ]);

    await expect(readAdminClaimStats(tx, createContext())).resolves.toStrictEqual({
      intake: 3,
      verification: 0,
      processing: 4,
      negotiation: 0,
      legal: 0,
      completed: 7,
    });
  });

  it('returns zeros when the aggregate yields no row', async () => {
    const { tx } = createTx([]);

    await expect(readAdminClaimStats(tx, createContext())).resolves.toStrictEqual(ZERO_STATS);
  });

  it('counts each lifecycle stage over the unchanged status groups', async () => {
    const { tx, select } = createTx();

    await readAdminClaimStats(tx, createContext());

    const fields = select.mock.calls[0]?.[0] as Record<string, SQL>;
    expect(Object.keys(fields)).toEqual(Object.keys(STAGE_STATUSES));
    for (const [stage, statuses] of Object.entries(STAGE_STATUSES)) {
      const compiled = compile(fields[stage]);
      expect(compiled.sql).toMatch(/^count\(CASE WHEN /);
      expect(compiled.params).toEqual(statuses);
    }
  });

  it('scopes by effective access tenant and uses the home tenant only when access is NULL', async () => {
    const { tx, where } = createTx();

    await readAdminClaimStats(tx, createContext({ tenantId: 'tenant-MK' }));

    const compiled = capturedCondition(where);
    expect(compiled.sql).toBe(ACCESS_TENANT_SQL);
    expect(compiled.params).toEqual(['tenant-MK', 'tenant-MK']);
    // No bare home-tenant clause that would drop transferred-in claims.
    expect(compiled.sql.match(/"claim"\."tenant_id"/g)).toHaveLength(1);
  });

  it.each(['admin', 'tenant_admin', 'super_admin'])(
    'scopes %s stats to the access tenant with no extra branch condition',
    async role => {
      const { tx, where } = createTx();

      await readAdminClaimStats(tx, createContext({ role, branchId: 'branch-1' }));

      const compiled = capturedCondition(where);
      expect(compiled.sql).toBe(ACCESS_TENANT_SQL);
      expect(compiled.params).toEqual(['tenant-A', 'tenant-A']);
    }
  );

  it('keeps staff stats tenant-wide as before', async () => {
    const { tx, where } = createTx();

    await readAdminClaimStats(
      tx,
      createContext({ role: 'staff', userId: 'staff-1', branchId: 'branch-1' })
    );

    const compiled = capturedCondition(where);
    expect(compiled.sql).toBe(ACCESS_TENANT_SQL);
    expect(compiled.params).toEqual(['tenant-A', 'tenant-A']);
  });

  it('scopes branch manager stats to the access tenant and own branch', async () => {
    const { tx, where } = createTx();

    await readAdminClaimStats(tx, createContext({ role: 'branch_manager', branchId: 'branch-1' }));

    const compiled = capturedCondition(where);
    expect(compiled.sql).toBe(`(${ACCESS_TENANT_SQL} and "claim"."branch_id" = $3)`);
    expect(compiled.params).toEqual(['tenant-A', 'tenant-A', 'branch-1']);
  });

  it.each([null, ''])(
    'denies all rows for a branch manager with branchId %j instead of widening to the tenant',
    async branchId => {
      const { tx, where } = createTx();

      await readAdminClaimStats(tx, createContext({ role: 'branch_manager', branchId }));

      const compiled = capturedCondition(where);
      expect(compiled.sql).toBe(`(${ACCESS_TENANT_SQL} and false)`);
      expect(compiled.params).toEqual(['tenant-A', 'tenant-A']);
    }
  );

  it('propagates an error thrown while awaiting the read', async () => {
    const failure = new Error('permission denied for table claim');
    const { tx } = createTx(failure);

    await expect(readAdminClaimStats(tx, createContext())).rejects.toBe(failure);
  });

  it('propagates an error thrown synchronously by select', async () => {
    const failure = new Error('select failed');
    const tx = {
      select: vi.fn(() => {
        throw failure;
      }),
    } as unknown as TenantTransaction;

    await expect(readAdminClaimStats(tx, createContext())).rejects.toBe(failure);
    expect(hoisted.captureException).not.toHaveBeenCalled();
  });
});

describe('getAdminClaimStats', () => {
  beforeEach(() => {
    hoisted.withTenantContext.mockReset();
    hoisted.captureException.mockReset();
  });

  it('reads in exactly one tenant transaction and uses the callback transaction', async () => {
    const { tx, select, where } = createTx([
      { intake: '2', verification: 0, processing: 0, negotiation: 0, legal: 0, completed: '1' },
    ]);
    hoisted.withTenantContext.mockImplementation(
      async (_context: unknown, callback: (tx: TenantTransaction) => Promise<unknown>) =>
        callback(tx)
    );

    const result = await getAdminClaimStats(
      createContext({ role: 'branch_manager', branchId: 'branch-1', userId: 'manager-1' })
    );

    expect(result).toStrictEqual({ ...ZERO_STATS, intake: 2, completed: 1 });
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext.mock.calls[0]?.[0]).toStrictEqual({
      tenantId: 'tenant-A',
      role: 'branch_manager',
    });
    // The only read goes through the transaction handed to the callback.
    expect(select).toHaveBeenCalledTimes(1);
    expect(capturedCondition(where).params).toEqual(['tenant-A', 'tenant-A', 'branch-1']);
    expect(hoisted.captureException).not.toHaveBeenCalled();
  });

  it('returns the zero DTO and reports when the reader fails inside the transaction', async () => {
    const failure = new Error('permission denied for table claim');
    const { tx } = createTx(failure);
    hoisted.withTenantContext.mockImplementation(
      async (_context: unknown, callback: (tx: TenantTransaction) => Promise<unknown>) =>
        callback(tx)
    );

    await expect(getAdminClaimStats(createContext())).resolves.toStrictEqual(ZERO_STATS);

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.captureException).toHaveBeenCalledTimes(1);
    expect(hoisted.captureException).toHaveBeenCalledWith(failure, {
      extra: { tenantId: 'tenant-A', action: 'getAdminClaimStats' },
    });
  });

  it('returns the zero DTO when the tenant transaction itself fails', async () => {
    const failure = new Error('connection refused');
    hoisted.withTenantContext.mockRejectedValue(failure);

    await expect(getAdminClaimStats(createContext())).resolves.toStrictEqual(ZERO_STATS);

    expect(hoisted.captureException).toHaveBeenCalledWith(failure, {
      extra: { tenantId: 'tenant-A', action: 'getAdminClaimStats' },
    });
  });
});
