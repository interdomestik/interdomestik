// Test support: a database double for the activity commands. Conditions are plain objects, each
// table records its name, and the fake transaction records every locked read, feed read and
// insert, so a test can assert what was read under which predicate and what was written.
import { vi, type Mock } from 'vitest';

type Row = Record<string, unknown>;
export type Condition = { op: string; left?: unknown; right?: unknown; args?: Condition[] };

function table(name: string, columns: string[]) {
  return Object.freeze({
    __table: name,
    ...Object.fromEntries(columns.map(column => [column, `${name}.${column}`])),
  });
}

const and = (...args: Condition[]): Condition => ({ op: 'and', args });
const eq = (left: unknown, right: unknown): Condition => ({ op: 'eq', left, right });

export const execute: Mock<(...args: unknown[]) => unknown> = vi.fn();

export const databaseMock = {
  and,
  eq,
  desc: (column: unknown) => ({ op: 'desc', column }),
  db: { execute: (...args: unknown[]) => execute(...args) },
  crmLeads: table('crmLeads', ['id', 'tenantId', 'agentId']),
  crmActivities: table('crmActivities', ['id', 'leadId', 'tenantId', 'createdAt']),
  user: table('user', ['id', 'tenantId', 'agentId']),
  agentClients: table('agentClients', ['id', 'tenantId', 'agentId', 'memberId', 'status']),
  memberActivities: table('memberActivities', ['memberId', 'tenantId', 'occurredAt']),
};

/** The tenant transaction runner the commands call; `useFakeTx` routes it to a fake. */
export const withTenantAuthority: Mock<
  (authority: unknown, callback: (tx: unknown) => unknown) => Promise<unknown>
> = vi.fn();

export const tenantContextMock = {
  withTenantAuthority: (authority: unknown, callback: (tx: unknown) => unknown) =>
    withTenantAuthority(authority, callback),
};

/** The id every inserted activity gets. */
export const ACTIVITY_ID = 'ACT-123';
export const nanoidMock = { nanoid: () => ACTIVITY_ID };

export const drizzleMock = {
  and,
  eq,
  sql: (strings: TemplateStringsArray) => ({ op: 'sql', text: strings.join('?') }),
};

export type LockedRead = { table: string; where: Condition; lock: string };

/** Rows a locked read of each table returns, and the rows each feed read returns. */
export type FakeRows = {
  locked?: Partial<Record<string, Row[]>>;
  feed?: Partial<Record<string, Row[]>>;
  failFeed?: Error;
};

export function createFakeTx(rows: FakeRows = {}) {
  const lockedReads: LockedRead[] = [];
  const feedReads: Array<{ table: string; args: { where: Condition } }> = [];
  const inserts: Array<{ table: string; values: Row }> = [];
  const tx = {
    select: () => ({
      from: (source: { __table: string }) => ({
        where: (where: Condition) => ({
          for: (lock: string) => {
            lockedReads.push({ table: source.__table, where, lock });
            return Promise.resolve(rows.locked?.[source.__table] ?? []);
          },
        }),
      }),
    }),
    insert: (target: { __table: string }) => ({
      values: (values: Row) => {
        inserts.push({ table: target.__table, values });
        return Promise.resolve();
      },
    }),
    query: new Proxy(
      {},
      {
        get: (_target, name: string) => ({
          findMany: (args: { where: Condition }) => {
            feedReads.push({ table: name, args });
            if (rows.failFeed) return Promise.reject(rows.failFeed);
            return Promise.resolve(rows.feed?.[name] ?? []);
          },
        }),
      }
    ),
  };
  return { tx, lockedReads, feedReads, inserts };
}

/** The `eq` predicates of a condition, as `column → value`. */
export function equalities(where: Condition): Record<string, unknown> {
  const parts = where.op === 'and' ? (where.args ?? []) : [where];
  return Object.fromEntries(
    parts.filter(part => part.op === 'eq').map(part => [String(part.left), part.right])
  );
}

/** Routes every tenant transaction to a new fake transaction holding these rows. */
export function useFakeTx(rows: FakeRows) {
  const fake = createFakeTx(rows);
  withTenantAuthority.mockImplementation((_authority, callback) =>
    Promise.resolve(callback(fake.tx))
  );
  return fake;
}
