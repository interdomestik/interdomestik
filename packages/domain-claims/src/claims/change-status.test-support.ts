import { getTableName, QueryPromise, sql, SQL, type Table } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { vi, type Mock } from 'vitest';

const mocks: { transaction: Mock; resolveMembership: Mock; lockSponsor: Mock } = vi.hoisted(() => ({
  transaction: vi.fn(),
  resolveMembership: vi.fn(),
  lockSponsor: vi.fn(),
}));
export { mocks };

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: mocks.transaction,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsor-coverage', () => ({
  lockPersonCoverageInputs: mocks.lockSponsor,
  resolveEffectiveMembership: mocks.resolveMembership,
}));

type Data = Record<string, unknown>;
type Store = Record<string, Data[]>;

class MockSelect extends QueryPromise<Data[]> {
  constructor(private readonly read: () => Data[]) {
    super();
  }

  execute() {
    return Promise.resolve(this.read());
  }
}

export function statusTransaction(rows: Store) {
  const operations: string[] = [];
  const conditions: Record<string, { sql: string; params: unknown[] }> = {};
  const writes: Store = {};
  const pending: Store = {};
  const dialect = new PgDialect();
  const fixedTime = new Date('2026-11-22T09:59:59.000Z');
  let failingInsert: string | undefined;
  let casConflict = false;

  const track = (operation: keyof typeof conditions, where: SQL) => {
    conditions[operation] = dialect.sqlToQuery(where);
  };
  const select = (selection: Data = {}) => ({
    from: (table: Table | SQL) => {
      if (table instanceof SQL) {
        if ('locked' in selection) {
          operations.push('lock:allowance');
          if (selection.locked instanceof SQL) track('lock:allowance', selection.locked);
          return Promise.resolve([{ locked: null }]);
        }
        if ('epochMs' in selection) {
          operations.push('read:clock');
          return Promise.resolve([{ epochMs: fixedTime.getTime() }]);
        }
        throw new Error('unexpected SQL-only selection');
      }
      const name = getTableName(table);
      let prefix = 'read';
      let locking = 'count' in selection ? ':count' : '';
      const query = new MockSelect(() => {
        const key = `${prefix}:${name}${locking}`;
        operations.push(key);
        return rows[key] ?? [];
      });
      const chain = Object.assign(query, {
        limit: () => chain,
        leftJoin: () => {
          prefix = 'join';
          return chain;
        },
        innerJoin: () => chain,
        orderBy: () => chain,
        where: (where: SQL) => {
          track(`${prefix}:${name}${locking}`, where);
          return chain;
        },
        for: (lock: string) => {
          locking = `:${lock}`;
          return chain;
        },
        getSQL: () => sql`(select 1)`,
      });
      return chain;
    },
  });
  const insert = (table: Table) => ({
    values: (value: Data) => {
      const name = getTableName(table);
      operations.push(`insert:${name}`);
      if (name === failingInsert) throw new Error(`failed insert into ${name}`);
      (pending[name] ??= []).push(value);
      const chain = {
        returning: () => Promise.resolve([{ id: value.id }]),
        onConflictDoNothing: () => chain,
      };
      return chain;
    },
  });
  const update = (table: Table) => ({
    set: (values: Data) => ({
      where: (where: SQL) => {
        const name = getTableName(table);
        const op = `update:${name}`;
        operations.push(op);
        track(op, where);
        (pending[name] ??= []).push(values);
        return {
          returning: () =>
            Promise.resolve(casConflict ? [] : [{ id: 'claim-1', lifecycleVersion: 7 }]),
        };
      },
    }),
  });
  const tx = {
    execute: (query: SQL) => {
      const { sql } = dialect.sqlToQuery(query);
      if (sql.includes('claim_recovery_no_fee_evidence')) operations.push('lock:no-fee');
      return Promise.resolve([]);
    },
    select,
    insert,
    update,
  };
  mocks.transaction.mockImplementation(async (_authority, run) => {
    try {
      const result = await run(tx);
      Object.assign(writes, pending);
      operations.push('commit');
      return result;
    } catch (error) {
      operations.push('rollback');
      throw error;
    }
  });
  mocks.lockSponsor.mockImplementation(() => {
    operations.push('lock:sponsor');
    return Promise.resolve();
  });
  mocks.resolveMembership.mockImplementation(() => {
    operations.push('read:coverage');
    return Promise.resolve(
      new Map([
        [
          'member-1',
          {
            source: 'subscription',
            subscription: {
              id: 'sub-1',
              planId: 'standard',
              currentPeriodStart: new Date('2025-11-22T10:00:00Z'),
              currentPeriodEnd: new Date('2026-11-22T10:00:00Z'),
            },
          },
        ],
      ])
    );
  });

  return {
    operations,
    conditions,
    writes,
    fixedTime,
    failInsert: (name: string) => {
      failingInsert = name;
    },
    loseCas: () => {
      casConflict = true;
    },
  };
}
