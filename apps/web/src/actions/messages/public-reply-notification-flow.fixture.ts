/** In-memory boundary model; not PostgreSQL/RLS attestation. */
import {
  isTenantAuthority,
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import type { Session } from './context';
import {
  tables,
  operators,
  session,
  seedRows,
  type Row,
  type Column,
  type Predicate,
  type Find,
} from './public-reply-notification-flow.data';
export { tables, operators, ids, session } from './public-reply-notification-flow.data';
export const state = {
  session: session() as Session | null,
  mode: 'restricted' as 'restricted' | 'permissive',
  rows: {} as Record<string, Row[]>,
  ambientReads: [] as string[],
  external: [] as { kind: string; args: unknown[] }[],
  contexts: [] as { tenantId: string; role?: string }[],
  commits: 0,
  rollbacks: 0,
  projectionFault: false,
  notificationFault: false,
  scheduled: [] as { commits: number; notifications: number }[],
};
export function reset(mode: typeof state.mode): void {
  Object.assign(state, {
    session: session(),
    mode,
    ambientReads: [],
    external: [],
    contexts: [],
    commits: 0,
    rollbacks: 0,
    projectionFault: false,
    notificationFault: false,
    scheduled: [],
  });
  state.rows = seedRows();
}
function predicate(args: Find, name: string): Predicate {
  const where = args.where;
  if (!where) return () => true;
  return where.length >= 2
    ? (where as (table: Record<string, Column>, ops: typeof operators) => Predicate)(
        tables[name],
        operators
      )
    : (where as Predicate);
}
function nameOf(table: unknown): string {
  const name = Object.keys(tables).find(key => tables[key] === table);
  if (!name) throw new Error('Unknown fixture table');
  return name;
}
// Unique keys the model enforces, as PostgreSQL does: the primary key and the unique indexes the
// reply path writes against. `columns` is null for an expression index (never a column target).
type UniqueKey = { columns: readonly string[] | null; of: (row: Row) => unknown[] };
const columnKey = (...fields: string[]): UniqueKey => ({
  columns: fields,
  of: row => fields.map(field => row[field]),
});
const UNIQUE_KEYS: Record<string, UniqueKey[]> = {
  notificationDeliveries: [columnKey('id'), columnKey('tenantId', 'idempotencyKey')],
  // claim_response_requests_source_uq (0102, SQL-managed): (tenant_id, kind, coalesce(source, claim)).
  claimResponseRequests: [
    columnKey('id'),
    { columns: null, of: row => [row.tenantId, row.kind, row.sourceMessageId ?? row.claimId] },
  ],
};
/** The unique key an ON CONFLICT target names, compared as a set of columns, as PostgreSQL does. */
function arbiterOf(keys: readonly UniqueKey[], target: readonly string[]): UniqueKey {
  const wanted = new Set(target);
  const arbiter = keys.find(
    key =>
      key.columns !== null &&
      key.columns.length === wanted.size &&
      key.columns.every(field => wanted.has(field))
  );
  if (!arbiter) throw new Error('No unique key matches the ON CONFLICT target');
  return arbiter;
}
/**
 * Appends the rows of one statement. A row that repeats a unique key of an existing row or of an
 * earlier row in the statement is skipped under ON CONFLICT DO NOTHING when that key is the
 * arbiter (or no target is named); otherwise the whole statement fails before any write. A key
 * with a null part never conflicts, as in a PostgreSQL unique index.
 */
function insertUnique(
  name: string,
  target: Row[],
  inputs: readonly Row[],
  onConflict: { target: string[] | null } | null
): Row[] {
  const keys = UNIQUE_KEYS[name] ?? [columnKey('id')];
  const arbiter = onConflict?.target ? arbiterOf(keys, onConflict.target) : null;
  const keyOf = (row: Row, key: UniqueKey) => {
    const parts = key.of(row);
    return parts.some(part => part == null) ? null : JSON.stringify(parts);
  };
  const seen = keys.map(key => new Set(target.map(row => keyOf(row, key))));
  const fresh: Row[] = [];
  for (const row of inputs) {
    const hits = keys.filter((key, index) => {
      const value = keyOf(row, key);
      return value !== null && seen[index].has(value);
    });
    if (hits.length > 0) {
      const skipped = onConflict !== null && (arbiter === null || hits.includes(arbiter));
      if (!skipped) throw new Error('Duplicate fixture key');
      continue;
    }
    keys.forEach((key, index) => seen[index].add(keyOf(row, key)));
    fresh.push(row);
  }
  target.push(
    ...fresh.map(row => ({ createdAt: new Date('2026-10-15T00:00:00Z'), readAt: null, ...row }))
  );
  return fresh;
}
// Ambient clients never close; transaction clients get their own lifetime.
const OPEN_LIFETIME = Object.freeze({ open: true });
// Runs synchronously like an async body: a throw becomes a rejection, never a sync throw.
function promised<T>(run: () => T): Promise<T> {
  try {
    return Promise.resolve(run());
  } catch (error) {
    return Promise.reject(error);
  }
}
function withSender(row: Row, users: Row[]): Row {
  return { ...row, sender: users.find(user => user.id === row.senderId) };
}
function client(
  context?: { tenantId: string },
  staged?: Record<string, Row[]>,
  lifetime: { open: boolean } = OPEN_LIFETIME
) {
  const check = () => {
    if (!lifetime.open) throw new Error('Fixture transaction already closed');
  };
  const rows = (name: string) => {
    check();
    if (!context) {
      state.ambientReads.push(name);
      if (state.mode === 'restricted') return [];
    }
    return (staged ?? state.rows)[name].filter(
      row => !context || row.tenantId === context.tenantId
    );
  };
  const updateRows = (table: unknown, values: Partial<Row>, where: Predicate) => {
    if (!context) throw new Error('Unscoped fixture update');
    for (const row of rows(nameOf(table)).filter(where)) Object.assign(row, values);
  };
  return {
    query: Object.fromEntries(
      Object.keys(tables).map(name => [
        name,
        {
          findFirst: (args: Find = {}) => promised(() => rows(name).find(predicate(args, name))),
          findMany: (args: Find = {}) => promised(() => rows(name).filter(predicate(args, name))),
        },
      ])
    ),
    insert: (table: unknown) => ({
      // One atomic INSERT of one or more rows, checked against the table's unique keys.
      values: (input: Row | readonly Row[]) => {
        const name = nameOf(table);
        const inputs: readonly Row[] = Array.isArray(input) ? input : [input as Row];
        let onConflict: { target: string[] | null } | null = null;
        const promise = Promise.resolve().then(() => {
          check();
          if (name === 'notifications' && state.notificationFault)
            throw new Error('Synthetic notification failure');
          const denied = (row: Row) =>
            (!context && state.mode === 'restricted') ||
            (context && row.tenantId !== context.tenantId);
          if (inputs.some(denied)) throw new Error('Fixture write denied');
          return insertUnique(name, (staged ?? state.rows)[name], inputs, onConflict);
        });
        // The insert is awaitable like a Drizzle builder because it is the write promise itself.
        const returning = () => promise.then(inserted => inserted.map(row => ({ id: row.id })));
        const onConflictDoNothing = (config?: { target?: Column | Column[] }) => {
          const target = config?.target;
          onConflict = { target: target ? [target].flat().map(column => column.field) : null };
          return Object.assign(promise, { returning });
        };
        return Object.assign(promise, { returning, onConflictDoNothing });
      },
    }),
    delete: (table: unknown) => ({
      where: (where: Predicate) =>
        promised(() => {
          check();
          if (!context) throw new Error('Unscoped fixture delete');
          const target = staged ?? state.rows;
          const name = nameOf(table);
          target[name] = target[name].filter(
            row => row.tenantId !== context.tenantId || !where(row)
          );
        }),
    }),
    update: (table: unknown) => ({
      set: (values: Partial<Row>) => ({
        where: (where: Predicate) => promised(() => updateRows(table, values, where)),
      }),
    }),
    select: (fields: Record<string, Column>) => {
      let where: Predicate = () => true;
      let name = 'claimMessages';
      const read = (limit = Number.POSITIVE_INFINITY) =>
        promised(() => {
          check();
          if (name === 'claimMessages' && state.projectionFault)
            throw new Error('Synthetic projection failure');
          return rows(name)
            .filter(where)
            .slice(0, limit)
            .map(row =>
              name === 'claimMessages' ? withSender(row, (staged ?? state.rows).user) : row
            );
        });
      const builder = {
        from: (table: unknown) => {
          name = nameOf(table);
          return builder;
        },
        leftJoin: () => builder,
        where: (value: Predicate) => {
          where = value;
          let consumed = false;
          const all = Promise.resolve().then(() => (consumed ? [] : read()));
          const readOnce = (count?: number) => {
            consumed = true;
            return read(count);
          };
          return Object.assign(all, {
            // Subqueries use the same staged tenant rows as the outer update.
            values: () => {
              consumed = true;
              return rows(name)
                .filter(where)
                .map(row => row[Object.values(fields)[0].field]);
            },
            orderBy: () => Object.assign(readOnce(), { for: () => readOnce() }),
            for: () => readOnce(),
            limit: (count: number) => {
              const limited = readOnce(count);
              return Object.assign(limited, { for: () => limited });
            },
          });
        },
        limit: read,
      };
      return builder;
    },
  };
}
export const db = client();
export async function withTenantContext<T>(
  scope: TenantAuthority | { tenantId: string; role?: string },
  action: (tx: ReturnType<typeof client>) => Promise<T>
): Promise<T> {
  // withTenantAuthority reaches the root withTenantContext with the request's authority token.
  const context = isTenantAuthority(scope)
    ? { tenantId: readTenantAuthority(scope).tenantId }
    : scope;
  if (!context.tenantId?.trim()) throw new Error('Missing fixture tenant');
  state.contexts.push({ ...context });
  const staged = Object.fromEntries(
    Object.entries(state.rows).map(([name, rows]) => [name, rows.map(row => ({ ...row }))])
  );
  const lifetime = { open: true };
  try {
    const result = await action(client(context, staged, lifetime));
    state.rows = staged;
    state.commits++;
    return result;
  } catch (error) {
    state.rollbacks++;
    throw error;
  } finally {
    lifetime.open = false;
  }
}
