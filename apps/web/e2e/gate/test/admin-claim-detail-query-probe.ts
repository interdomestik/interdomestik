import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { E2E_RUNTIME_ROLE } from '../../../../../scripts/e2e-runtime-role.mjs';
import type { CapturedQuery } from './admin-claim-detail-plans';

export type RunSql = <Rows extends unknown[]>(
  text: string,
  binds?: unknown[],
  options?: unknown
) => PromiseLike<Rows>;

type TransactionClient = {
  unsafe: <Rows extends unknown[]>(
    ...args: Parameters<RunSql>
  ) => PromiseLike<Rows> & { values(): PromiseLike<unknown> };
};

export type Pool = {
  begin: <T>(callback: (client: TransactionClient) => Promise<T>) => Promise<T>;
  end: (options: { timeout: number }) => Promise<void>;
  options: typeof import('@interdomestik/database/db').dbRls.$client.options;
};

type Read = 'claim' | 'documents' | 'staff';
type TransactionTrace = { pid: number; reads: Read[] };
export type CheckoutTiming = { poolWaitMs: number; beginRoundTripMs: number };

function readKind(text: string): Read | undefined {
  if (text.includes('from "claim_documents"')) return 'documents';
  if (text.includes('from "user"')) return 'staff';
  if (text.includes('from "claim"')) return 'claim';
  return undefined;
}

async function restrictedBackend(run: RunSql) {
  const [row] = await run<{ pid: number; restricted: boolean; isolation: string }[]>(
    `select pg_backend_pid() as pid, current_setting('transaction_isolation') as isolation,
      current_user = $1 and current_user = session_user
      and rolcanlogin and not rolbypassrls and not rolsuper
      and not exists (
        select 1 from pg_class where oid in ('public.claim'::regclass, 'public.claim_documents'::regclass)
          and relowner = pg_roles.oid
      )
      and row_security_active('public.claim'::regclass)
      and row_security_active('public.claim_documents'::regclass) as restricted
      from pg_roles where rolname = current_user`,
    [E2E_RUNTIME_ROLE]
  );
  assert.equal(row?.restricted, true, 'Expected the non-owning restricted LOGIN with active RLS');
  assert.equal(row.isolation, 'read committed');
  assert.ok(row.pid > 0);
  return row.pid;
}

/** Instruments only the test worker's checked-out postgres-js transaction client. */
export async function observeRestrictedPool<T>(
  pool: Pool,
  work: (transactions: TransactionTrace[]) => Promise<T>,
  hooks: {
    measurePoolTiming?: boolean;
    beforeDocuments?: (run: RunSql, pid: number) => Promise<void>;
    afterRead?: (
      read: Read,
      run: RunSql,
      query: CapturedQuery,
      checkout?: CheckoutTiming
    ) => Promise<void>;
  } = {}
) {
  const transactions: TransactionTrace[] = [];
  const begin = pool.begin;
  const debug = pool.options.debug;
  let requestedAt: number | undefined;
  let dispatchedAt: number | undefined;
  if (hooks.measurePoolTiming) {
    // postgres-js calls debug after assigning a connection, just before sending BEGIN.
    pool.options.debug = (connection, text, params, types) => {
      if (text.trim() === 'begin') {
        assert.ok(requestedAt !== undefined && dispatchedAt === undefined);
        dispatchedAt = performance.now();
      }
      if (typeof debug === 'function') debug(connection, text, params, types);
    };
  }
  pool.begin = function observedBegin<R>(callback: (client: TransactionClient) => Promise<R>) {
    if (hooks.measurePoolTiming) {
      assert.equal(requestedAt, undefined, 'Expected one transaction per measured read');
      requestedAt = performance.now();
    }
    return begin<R>(async client => {
      let checkout: CheckoutTiming | undefined;
      if (hooks.measurePoolTiming) {
        const acknowledgedAt = performance.now();
        assert.ok(requestedAt !== undefined && dispatchedAt !== undefined, 'Missing BEGIN timing');
        checkout = {
          poolWaitMs: dispatchedAt - requestedAt,
          beginRoundTripMs: acknowledgedAt - dispatchedAt,
        };
      }
      const trace: TransactionTrace = { pid: 0, reads: [] };
      transactions.push(trace);
      const unsafe = client.unsafe;
      client.unsafe = function observedQuery<Rows extends unknown[]>(...args: Parameters<RunSql>) {
        const [text, binds = []] = args;
        const query = unsafe<Rows>(...args);
        const read = readKind(text);
        if (read) {
          trace.reads.push(read);
          const values = query.values.bind(query);
          query.values = async () => {
            if (read === 'claim') trace.pid = await restrictedBackend(unsafe);
            if (read === 'documents') await hooks.beforeDocuments?.(unsafe, trace.pid);
            const rows = await values();
            await hooks.afterRead?.(read, unsafe, { text, binds: [...binds] }, checkout);
            return rows;
          };
        }
        return query;
      };
      try {
        return await callback(client);
      } finally {
        client.unsafe = unsafe;
      }
    });
  };
  try {
    return await work(transactions);
  } finally {
    pool.begin = begin;
    if (hooks.measurePoolTiming) pool.options.debug = debug;
  }
}
