import { getTableName, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  queries: [] as { sql: string; params: unknown[] }[],
  selections: [] as string[][],
  joins: [] as { sql: string; params: unknown[] }[],
  fail: false,
}));
vi.mock('server-only', () => ({}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn((_authority, run: (tx: ReturnType<typeof transaction>) => unknown) =>
    Promise.resolve().then(() => {
      if (state.fail) throw new Error('PRIVATE-CONTENT-SENTINEL');
      return run(transaction());
    })
  ),
}));

function searchableText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).toLowerCase() : '';
}

function isGreater(left: unknown, right: unknown): boolean {
  const [a, b] = [Number(left), Number(right)];
  return !Number.isNaN(a) && !Number.isNaN(b) && a > b;
}

/** In-memory projection model; generated SQL is also asserted, no PostgreSQL/RLS proof. */
function transaction() {
  return {
    select(selection: Record<string, { name: string; table: Parameters<typeof getTableName>[0] }>) {
      state.selections.push(Object.keys(selection));
      let table = '';
      let predicate: SQL;
      let limit = Infinity;
      const joins: { table: string; on: SQL }[] = [];
      const compile = (value: SQL) => new PgDialect().sqlToQuery(value);
      type Joined = Record<string, Record<string, unknown>>;
      function matches(condition: SQL, row: Joined) {
        const { sql, params } = compile(condition);
        const equalities = [
          ...sql.matchAll(/"([^"]+)"\."([^"]+)" = (?:"([^"]+)"\."([^"]+)"|\$(\d+))/g),
        ];
        if (
          !equalities.every(
            m => row[m[1]]?.[m[2]] === (m[5] ? params[Number(m[5]) - 1] : row[m[3]]?.[m[4]])
          )
        )
          return false;
        const search = [...sql.matchAll(/"([^"]+)"\."([^"]+)" ilike \$(\d+)/g)];
        if (
          search.length &&
          !search.some(m => {
            const pattern = String(params[Number(m[3]) - 1])
              .slice(1, -1)
              .replace(/\\(.)/g, '$1')
              .toLowerCase();
            return searchableText(row[m[1]]?.[m[2]]).includes(pattern);
          })
        )
          return false;
        for (const m of sql.matchAll(/"([^"]+)"\."([^"]+)" is (not )?null/g)) {
          if ((row[m[1]]?.[m[2]] == null) === Boolean(m[3])) return false;
        }
        for (const m of sql.matchAll(/"([^"]+)"\."([^"]+)" > \$(\d+)/g)) {
          if (!isGreater(row[m[1]]?.[m[2]], params[Number(m[3]) - 1])) return false;
        }
        return true;
      }
      function evaluate() {
        state.queries.push(compile(predicate));
        let rows: Joined[] = (state.rows[table] ?? []).map(row => ({ [table]: row }));
        for (const join of joins)
          rows = rows.flatMap(row => {
            const matching = (state.rows[join.table] ?? [])
              .map(candidate => ({ ...row, [join.table]: candidate }))
              .filter(candidate => matches(join.on, candidate));
            return matching.length ? matching : [{ ...row, [join.table]: {} }];
          });
        return rows
          .filter(row => matches(predicate, row))
          .slice(0, limit)
          .map(row =>
            Object.fromEntries(
              Object.entries(selection).map(([key, column]) => [
                key,
                row[getTableName(column.table)]?.[column.name] ?? null,
              ])
            )
          );
      }
      type QueryBuilder = Promise<Record<string, unknown>[]> & {
        from(value: Parameters<typeof getTableName>[0]): QueryBuilder;
        leftJoin(value: Parameters<typeof getTableName>[0], on: SQL): QueryBuilder;
        where(value: SQL): QueryBuilder;
        orderBy(): QueryBuilder;
        limit(value: number): QueryBuilder;
      };
      const builder: QueryBuilder = Object.assign(Promise.resolve().then(evaluate), {
        from(value: Parameters<typeof getTableName>[0]) {
          table = getTableName(value);
          return builder;
        },
        leftJoin(value: Parameters<typeof getTableName>[0], on: SQL) {
          joins.push({ table: getTableName(value), on });
          state.joins.push(compile(on));
          return builder;
        },
        where(value: SQL) {
          predicate = value;
          return builder;
        },
        orderBy() {
          return builder;
        },
        limit(value: number) {
          limit = value;
          return builder;
        },
      });
      return builder;
    },
  };
}

export function resetMetadataModel() {
  state.fail = false;
  state.queries = [];
  state.selections = [];
  state.joins = [];
  const row = {
    id: 'own',
    tenant_id: 'tenant-a',
    branch_id: 'branch-a',
    staff_id: 'staff-a',
    status: 'accepted',
    urgency: 'high',
    created_at: new Date('2026-11-01T00:00:00Z'),
    updated_at: new Date('2026-11-02T00:00:00Z'),
    public_response_version: 2,
    subject: 'SUBJECT-SENTINEL',
    message: 'CONTENT-ONLY-SENTINEL',
    public_response: 'PUBLIC-SENTINEL',
    member_reply: 'REPLY-SENTINEL',
    reassign_reason: 'REASSIGN-SENTINEL',
    close_reason: 'CLOSE-SENTINEL',
  };
  state.rows = {
    support_handoffs: [
      row,
      { ...row, id: 'other-branch', branch_id: 'branch-b' },
      { ...row, id: 'other-tenant', tenant_id: 'tenant-b' },
    ],
    user: [
      { id: 'staff-a', tenant_id: 'tenant-a', name: 'Assignee' },
      { id: 'staff-a', tenant_id: 'tenant-b', name: 'FOREIGN-STAFF-SENTINEL' },
    ],
    branches: [
      { id: 'branch-a', tenant_id: 'tenant-a', name: 'Branch' },
      { id: 'branch-a', tenant_id: 'tenant-b', name: 'FOREIGN-BRANCH-SENTINEL' },
    ],
  };
}

export { state };
