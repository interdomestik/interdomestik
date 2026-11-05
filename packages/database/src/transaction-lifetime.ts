// Transaction lifetime: every capability a tenant transaction hands its callback expires when that
// callback settles. postgres.js keeps a transaction's connection in a closure and never checks
// whether the transaction is still running, so an escaped `tx` (returned, stored, captured by a
// timer) would otherwise run its query on whatever transaction holds that pooled connection next,
// under that transaction's tenant context. RLS cannot catch that: the context it sees is genuine.
//
// The adapter sits between the RLS pool and drizzle. Each `begin` and `savepoint` gets its own
// scope; the client handed to drizzle checks the scope (and its ancestors) at actual dispatch,
// which postgres.js defers past creation, so a query built while open but awaited after the end
// is rejected before it reaches PostgreSQL. The driver keeps its own client for COMMIT, ROLLBACK
// and savepoint control, so revocation never blocks the driver from finishing the transaction.
//
// The driver sends that control statement on its connection object once the callback settles.
// When the connection is lost first, the driver gives the transaction up and the same connection
// object may already serve another tenant's transaction; a late settlement would then COMMIT or
// ROLLBACK that transaction. A lost lease therefore withholds every later settlement from the
// driver for good, so no control statement of the abandoned scope or its savepoints is ever sent.

/** A postgres.js pending query, reduced to the members the adapter relies on. */
export type PendingQuery = PromiseLike<unknown> & {
  handler: (query: PendingQuery) => unknown;
  reject: (error: unknown) => void;
};

/** The client surface drizzle's postgres-js session uses inside a transaction. */
export type TransactionSql = {
  readonly options: unknown;
  unsafe(query: string, params?: unknown[]): PendingQuery;
  savepoint<T>(callback: (sql: TransactionSql) => Promise<T>): Promise<T>;
};

/** The pool surface drizzle uses outside a transaction, plus `begin` and `end`. */
export type PoolSql = {
  readonly options: unknown;
  unsafe(query: string, params?: unknown[]): PendingQuery;
  begin<T>(callback: (sql: TransactionSql) => Promise<T>): Promise<T>;
  end(options?: { timeout?: number }): Promise<void>;
};

export class ClosedTransactionError extends Error {
  constructor() {
    super('Tenant transaction capability used after its transaction ended');
    this.name = 'ClosedTransactionError';
  }
}

type Scope = { open: boolean; parent: Scope | null; children: Set<Promise<unknown>> };
type Lease = { lost: boolean };

function isOpen(scope: Scope): boolean {
  for (let current: Scope | null = scope; current; current = current.parent) {
    if (!current.open) return false;
  }
  return true;
}

function requireCallback(callback: unknown): void {
  // Option-taking overloads (`begin('read write', fn)`) are not part of the reviewed surface.
  if (typeof callback !== 'function') throw new TypeError('Unsupported transaction call form');
}

// The check runs where postgres.js dispatches, after its deferral, not where the query is built.
function guardDispatch(query: PendingQuery, scope: Scope): PendingQuery {
  const dispatch = query.handler;
  query.handler = pending =>
    isOpen(scope) ? dispatch(pending) : pending.reject(new ClosedTransactionError());
  return query;
}

// What the driver awaits before it sends COMMIT, ROLLBACK or ROLLBACK TO: the scope's outcome,
// unless the lease was lost by then, in which case it never settles.
function fenced<T>(lease: Lease, work: Promise<T>, onSettle: () => void = () => undefined) {
  return new Promise<T>((resolve, reject) => {
    const settle = (finish: () => void) => {
      if (lease.lost) return;
      onSettle();
      finish();
    };
    work.then(
      value => settle(() => resolve(value)),
      error => settle(() => reject(error))
    );
  });
}

async function runScoped<T>(
  driverSql: TransactionSql,
  callback: (sql: TransactionSql) => Promise<T>,
  parent: Scope | null,
  lease: Lease,
  onScope: (scope: Scope) => void = () => undefined
): Promise<T> {
  const scope: Scope = { open: true, parent, children: new Set() };
  onScope(scope);
  try {
    // `return await`: builders the callback returns must execute while the scope is open.
    return await callback(scopedSql(driverSql, scope, lease));
  } finally {
    scope.open = false;
    // Detached savepoints finish (and fail) before the driver commits or rolls back.
    while (scope.children.size > 0) await Promise.allSettled([...scope.children]);
  }
}

function scopedSql(driverSql: TransactionSql, scope: Scope, lease: Lease): TransactionSql {
  return Object.freeze({
    options: driverSql.options,
    unsafe(query: string, params?: unknown[]): PendingQuery {
      if (!isOpen(scope)) throw new ClosedTransactionError();
      return guardDispatch(driverSql.unsafe(query, params), scope);
    },
    savepoint<T>(callback: (sql: TransactionSql) => Promise<T>): Promise<T> {
      requireCallback(callback);
      if (!isOpen(scope)) return Promise.reject(new ClosedTransactionError());
      const run = driverSql.savepoint(child =>
        fenced(lease, runScoped(child, callback, scope, lease))
      );
      const settled = run.then(
        () => undefined,
        () => undefined
      );
      scope.children.add(settled);
      void settled.then(() => scope.children.delete(settled));
      return run;
    },
  });
}

/** Wraps the RLS pool so every transaction and savepoint scope expires with its callback. */
export function withTransactionLifetime(pool: PoolSql): PoolSql {
  return Object.freeze({
    options: pool.options,
    unsafe: (query: string, params?: unknown[]) => pool.unsafe(query, params),
    begin<T>(callback: (sql: TransactionSql) => Promise<T>): Promise<T> {
      requireCallback(callback);
      const lease: Lease = { lost: false };
      let scope: Scope | undefined;
      let settled = false;
      const run = pool.begin(driverSql =>
        fenced(
          lease,
          runScoped(driverSql, callback, null, lease, opened => {
            scope = opened;
          }),
          () => {
            settled = true;
          }
        )
      );
      // The driver finished without the callback: the connection was lost. Revoke the suspended
      // callback's client now and fence its eventual settlement away from the driver.
      return run.finally(() => {
        if (!settled) lease.lost = true;
        if (scope) scope.open = false;
      });
    },
    end: (options?: { timeout?: number }) => pool.end(options),
  });
}
