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
  reportExpired: null as string[] | null,
  auditLoggerPassed: null as unknown,
  projectionFault: false,
  notificationFault: false,
  pushFault: false,
  jobs: [] as Array<() => Promise<void>>,
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
    reportExpired: null,
    auditLoggerPassed: null,
    projectionFault: false,
    notificationFault: false,
    pushFault: false,
    jobs: [],
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
// Ambient clients never close; transaction clients get their own lifetime.
const OPEN_LIFETIME = Object.freeze({ open: true });
// Runs synchronously like an async body: a throw becomes a rejection, never a sync throw.
const promised = <T>(run: () => T): Promise<T> => new Promise<T>(resolve => resolve(run()));
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
    if (state.pushFault && ['pushSubscriptions', 'userNotificationPreferences'].includes(name))
      throw new Error('Synthetic optional push failure');
    return (staged ?? state.rows)[name].filter(
      row => !context || row.tenantId === context.tenantId
    );
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
      values: (input: Row) => {
        const name = nameOf(table);
        let ignoreConflict = false;
        const promise = Promise.resolve().then(() => {
          check();
          if (name === 'notifications' && state.notificationFault)
            throw new Error('Synthetic notification failure');
          if (
            (!context && state.mode === 'restricted') ||
            (context && input.tenantId !== context.tenantId)
          )
            throw new Error('Fixture write denied');
          if ((staged ?? state.rows)[name].some(row => row.id === input.id)) {
            if (ignoreConflict) return false;
            throw new Error('Duplicate fixture id');
          }
          (staged ?? state.rows)[name].push({
            createdAt: new Date('2026-10-15T00:00:00Z'),
            readAt: null,
            ...input,
          });
          return true;
        });
        // The insert is awaitable like a Drizzle builder because it is the write promise itself.
        const returning = () => promise.then(inserted => (inserted ? [{ id: input.id }] : []));
        const onConflictDoNothing = () => {
          ignoreConflict = true;
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
    select: () => {
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
              name === 'claimMessages'
                ? {
                    ...row,
                    sender: (staged ?? state.rows).user.find(user => user.id === row.senderId),
                  }
                : row
            );
        });
      const builder = {
        from: (table: unknown) => {
          name = nameOf(table);
          return builder;
        },
        leftJoin: () => builder,
        // An unlimited read is awaited on where(); limit() replaces it before it runs.
        where: (value: Predicate) => {
          where = value;
          let limited = false;
          const all = Promise.resolve().then(() => (limited ? [] : read()));
          return Object.assign(all, {
            limit: (count?: number) => {
              limited = true;
              return read(count);
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
export const delivery =
  (kind: string) =>
  (...args: unknown[]) => {
    state.external.push({ kind, args });
    return Promise.resolve({ success: true });
  };
export const email = Object.fromEntries(
  [
    'sendEmail',
    'sendClaimAssignedEmail',
    'sendClaimSubmittedEmail',
    'sendNewMessageEmail',
    'sendPaymentVerificationEmail',
    'sendStatusChangedEmail',
  ].map(name => [name, delivery(name)])
);
export async function settle(): Promise<void> {
  while (state.jobs.length) await state.jobs.shift()!();
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
