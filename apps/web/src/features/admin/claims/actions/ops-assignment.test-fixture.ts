import { claims } from '@interdomestik/database/schema';
import { getTableColumns, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { vi, type Mock } from 'vitest';

type Row = Record<string, unknown>;
type TenantAction = (tx: unknown) => Promise<unknown>;

const dialect = new PgDialect();

export const UNASSIGNED_CLAIM: Row = {
  id: 'claim-1',
  tenantId: 'tenant-1',
  staffId: null,
  claimNumber: 'CLM-XK-KS01-2026-000001',
  caseLifecycleState: 'evaluation',
  recoveryLifecycleState: 'not_started',
};

export function sqlOf(condition: unknown): { sql: string; params: unknown[] } {
  return dialect.sqlToQuery(condition as SQL);
}

const CLAIM_COLUMN_KEYS: ReadonlyMap<string, string> = new Map(
  Object.entries(getTableColumns(claims)).map(([key, column]) => [column.name, key])
);
const GUARD_TERM = /^(?:"[^"]+"\.)?"([^"]+)" (?:= \$(\d+)|(is null))$/i;

/**
 * Evaluates a rendered conjunctive update guard (column = $n / column is null) against a concrete
 * claim row, as Postgres would. Any unsupported SQL shape throws, so the evaluator fails closed.
 */
export function guardMatchesRow(condition: unknown, row: Row): boolean {
  const { sql, params } = sqlOf(condition);
  if (/\bor\b/i.test(sql)) throw new Error(`Unsupported guard SQL: ${sql}`);
  return sql
    .replace(/[()]/g, '')
    .split(/\s+and\s+/i)
    .every(term => {
      const match = GUARD_TERM.exec(term.trim());
      const key = match ? CLAIM_COLUMN_KEYS.get(match[1]) : undefined;
      if (!match || !key) throw new Error(`Unsupported guard term: ${term}`);
      if (match[3]) return (row[key] ?? null) === null;
      return row[key] === params[Number(match[2]) - 1];
    });
}

export function sessionFor(role: string, user: Row = {}) {
  return { user: { id: 'actor-1', role, tenantId: 'tenant-1', ...user } };
}

/** Database module mock: real schema/operators, `db` throws so callback-only access is provable. */
export async function createDatabaseModuleMock(withTenantContext: Mock, directDbAccess: string[]) {
  const drizzle = await import('drizzle-orm');
  const schema = await import('@interdomestik/database/schema');
  const db = new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property === 'symbol' || property === 'then') return undefined;
        directDbAccess.push(property);
        throw new Error(`Direct db access is not allowed: ${property}`);
      },
    }
  );
  return {
    ...schema,
    and: drizzle.and,
    desc: drizzle.desc,
    eq: drizzle.eq,
    isNull: drizzle.isNull,
    db,
    withTenantContext,
  };
}

export type FakeTxOptions = Readonly<{
  claim?: Row | undefined;
  claimReadError?: Error;
  target?: { id: string } | undefined;
  /** Forces the update result regardless of the guard. */
  updatedRows?: Row[];
  /** Actual row at update time; the rendered guard is evaluated against it. */
  rowAtUpdate?: Row;
  auditError?: Error;
}>;

export function createFakeTx(options: FakeTxOptions = {}) {
  const claim = 'claim' in options ? options.claim : UNASSIGNED_CLAIM;
  const target = 'target' in options ? options.target : { id: 'staff-1' };
  const updateSet = vi.fn();
  const updateWhere = vi.fn();
  const auditValues = vi.fn((_row: Row) =>
    options.auditError ? Promise.reject(options.auditError) : Promise.resolve()
  );
  const tx = {
    query: {
      claims: {
        findFirst: vi.fn((_args: { where: unknown }) =>
          options.claimReadError ? Promise.reject(options.claimReadError) : Promise.resolve(claim)
        ),
      },
      user: { findFirst: vi.fn((_args: { where: unknown }) => Promise.resolve(target)) },
    },
    update: vi.fn((_table: unknown) => ({
      set: (values: Row) => {
        updateSet(values);
        return {
          where: (condition: unknown) => {
            updateWhere(condition);
            return {
              returning: (): Promise<Row[]> => {
                if (options.updatedRows) return Promise.resolve(options.updatedRows);
                if (options.rowAtUpdate && !guardMatchesRow(condition, options.rowAtUpdate)) {
                  return Promise.resolve([]);
                }
                return Promise.resolve([
                  {
                    id: 'claim-1',
                    staffId: values.staffId,
                    assignedAt: values.assignedAt,
                    assignedById: values.assignedById,
                  },
                ]);
              },
            };
          },
        };
      },
    })),
    insert: vi.fn((_table: unknown) => ({ values: auditValues })),
  };
  return { tx, updateSet, updateWhere, auditValues };
}

/** Routes withTenantContext to the fake tx and records whether the callback returned or threw. */
export function routeTenantContext(withTenantContext: Mock, tx: unknown) {
  const outcomes: Array<'returned' | 'threw'> = [];
  withTenantContext.mockImplementation(async (_context: unknown, action: TenantAction) => {
    try {
      const result = await action(tx);
      outcomes.push('returned');
      return result;
    } catch (error) {
      outcomes.push('threw');
      throw error;
    }
  });
  return outcomes;
}
