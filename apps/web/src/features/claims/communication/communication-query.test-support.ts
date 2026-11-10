import { getTableName, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { vi } from 'vitest';

export const state = vi.hoisted(() => ({
  descriptor: {
    tenantId: 'tenant-a',
    accessTenantId: 'tenant-a',
    purpose: 'session',
    principal: { userId: 'bm', role: 'branch_manager', branchId: 'branch-a', agentId: null },
  },
  rows: {} as Record<string, Record<string, unknown>[]>,
  selections: [] as string[][],
  queries: [] as { sql: string; params: unknown[] }[],
  orderings: [] as string[],
  joins: [] as { sql: string; params: unknown[] }[],
  fail: false,
}));
export const authority = {} as TenantAuthority;
vi.mock('server-only', () => ({}));
vi.mock('@interdomestik/database/tenant-authority', () => ({
  readTenantAuthority: (token: unknown) => {
    if (token !== authority) throw new Error('Unrecognized tenant authority');
    return state.descriptor;
  },
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn((_authority, run: (tx: ReturnType<typeof transaction>) => unknown) =>
    Promise.resolve().then(() => {
      if (state.fail) throw new Error('PRIVATE-CONTENT-SENTINEL');
      return run(transaction());
    })
  ),
}));

// In-memory query model, not database/RLS proof. It evaluates the generated equality predicates
// against rows from multiple branches and tenants and returns only the selected columns.
function transaction() {
  return {
    select(
      selection: Record<string, { name?: string; table?: Parameters<typeof getTableName>[0] }>
    ) {
      state.selections.push(Object.keys(selection));
      let table = '';
      let predicate: SQL | undefined;
      let descending = false;
      let nullsLast = true;
      let limit = Infinity;
      const joins: { table: string; on: SQL }[] = [];
      const builder = {
        from(value: Parameters<typeof getTableName>[0]) {
          table = getTableName(value);
          return builder;
        },
        leftJoin(value: Parameters<typeof getTableName>[0], on: SQL) {
          joins.push({ table: getTableName(value), on });
          state.joins.push(new PgDialect().sqlToQuery(on));
          return builder;
        },
        where(value: SQL) {
          predicate = value;
          return builder;
        },
        orderBy(...values: SQL[]) {
          const ordering = new PgDialect().sqlToQuery(values[0]).sql;
          state.orderings.push(ordering);
          descending = ordering.includes('desc');
          nullsLast =
            ordering.includes('nulls last') || (!descending && !ordering.includes('nulls first'));
          return builder;
        },
        limit(value: number) {
          limit = value;
          return builder;
        },
        then(resolve: (rows: Record<string, unknown>[]) => unknown) {
          const query = new PgDialect().sqlToQuery(predicate!);
          state.queries.push(query);
          type Row = Record<string, unknown>;
          type JoinedRow = Record<string, Row>;
          const matches = (condition: SQL, row: JoinedRow) => {
            const { sql, params } = new PgDialect().sqlToQuery(condition);
            return [
              ...sql.matchAll(/"([^"]+)"\."([^"]+)" = (?:"([^"]+)"\."([^"]+)"|\$(\d+))/g),
            ].every(
              match =>
                row[match[1]]?.[match[2]] ===
                (match[5] ? params[Number(match[5]) - 1] : row[match[3]]?.[match[4]])
            );
          };
          let rows: JoinedRow[] = (state.rows[table] ?? []).map(row => ({ [table]: row }));
          for (const join of joins) {
            rows = rows.flatMap(row => {
              const candidates = (state.rows[join.table] ?? [])
                .map(candidate => ({ ...row, [join.table]: candidate }))
                .filter(candidate => matches(join.on, candidate));
              return candidates.length ? candidates : [{ ...row, [join.table]: {} }];
            });
          }
          rows = rows.filter(row => matches(predicate!, row));
          if ('count' in selection) {
            const timestamps = rows
              .map(row => row[table].created_at as Date | null)
              .filter(Boolean) as Date[];
            return resolve([
              {
                count: rows.length,
                lastMessageAt: timestamps.length
                  ? new Date(Math.max(...timestamps.map(date => date.getTime())))
                  : null,
              },
            ]);
          }
          rows = [...rows].sort((a, b) => {
            const left = (a[table].created_at as Date | null)?.getTime();
            const right = (b[table].created_at as Date | null)?.getTime();
            if (left == null && right != null) return nullsLast ? 1 : -1;
            if (right == null && left != null) return nullsLast ? -1 : 1;
            return (
              ((left ?? 0) - (right ?? 0) ||
                String(a[table].id).localeCompare(String(b[table].id))) * (descending ? -1 : 1)
            );
          });
          return resolve(
            rows
              .slice(0, limit)
              .map(row =>
                Object.fromEntries(
                  Object.entries(selection).map(([key, column]) => [
                    key,
                    row[column.table ? getTableName(column.table) : table]?.[column.name!] ?? null,
                  ])
                )
              )
          );
        },
      };
      return builder;
    },
  };
}

export function resetQueryModel(): void {
  state.fail = false;
  state.descriptor = {
    tenantId: 'tenant-a',
    accessTenantId: 'tenant-a',
    purpose: 'session',
    principal: { userId: 'bm', role: 'branch_manager', branchId: 'branch-a', agentId: null },
  };
  state.selections = [];
  state.queries = [];
  state.orderings = [];
  state.joins = [];
  state.rows = {
    claim: [
      {
        id: 'own',
        tenant_id: 'tenant-a',
        branch_id: 'branch-a',
        userId: 'member',
        status: 'verification',
        case_lifecycle_state: 'verification',
        recovery_lifecycle_state: 'not_started',
      },
      { id: 'other-branch', tenant_id: 'tenant-a', branch_id: 'branch-b', userId: 'member' },
      { id: 'foreign', tenant_id: 'tenant-b', branch_id: 'branch-a', userId: 'member' },
    ],
    user: [
      { id: 'member', tenant_id: 'tenant-a', role: 'member' },
      { id: 'staff', tenant_id: 'tenant-a', role: 'staff' },
      { id: 'agent', tenant_id: 'tenant-a', role: 'agent' },
    ],
    claim_messages: [],
    claim_stage_history: [],
  };
}

export function message(id: string, sender: string, internal: boolean | null, time: string | null) {
  return {
    id,
    claim_id: 'own',
    tenant_id: 'tenant-a',
    sender_id: sender,
    is_internal: internal,
    created_at: time ? new Date(time) : null,
    content: 'PRIVATE-CONTENT-SENTINEL',
    sender_name: 'PRIVATE-SENDER-SENTINEL',
  };
}
