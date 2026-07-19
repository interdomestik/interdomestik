import { createHash, timingSafeEqual } from 'node:crypto';
import postgres from 'postgres';
import { resolveAdminConnectionConfig } from './admin-connection-config';

// prettier-ignore
export type AdminConnectionAuthority = Readonly<{ environmentClass: 'local_scratch' | 'supabase_direct'; receiptSha256: string; endpointSha256: string; caSha256: string; expectedRolsuper: boolean; expectedRolbypassrls: boolean }>;
type Reserved = postgres.ReservedSql<Record<never, never>>;
type Options = postgres.Options<Record<never, never>>;
// prettier-ignore
type Probe = Record<'identity_ok' | 'owner_ok' | 'role_ok' | 'state_ok' | 'tls', boolean> & { pid: number; server_major: number };
const ABORT = Symbol('abort');
const HEX = /^[a-f0-9]{64}$/;
const APPLICATION = 'interdomestik_admin_config_v1';

function fail(code: string, cleanup = false) {
  const cleanupCode = cleanup && code !== 'ADMIN_DB_PREFLIGHT_CLEANUP_FAILED';
  const error = cleanupCode
    ? { code, cleanup_code: 'ADMIN_DB_PREFLIGHT_CLEANUP_FAILED' }
    : { code };
  return Object.freeze({ ok: false as const, error: Object.freeze(error) });
}
function digestMatches(value: string, expected: string): boolean {
  if (!HEX.test(expected)) return false;
  return timingSafeEqual(createHash('sha256').update(value).digest(), Buffer.from(expected, 'hex'));
}
function authorityMatches(options: Options, kind: string, authority: AdminConnectionAuthority) {
  const keys = Object.keys(authority)
    .sort((left, right) => left.localeCompare(right))
    .join(',');
  const ssl = options.ssl && typeof options.ssl === 'object' ? options.ssl : undefined;
  const receipt = {
    environmentClass: authority.environmentClass,
    endpointSha256: authority.endpointSha256,
    caSha256: authority.caSha256,
    expectedRolsuper: authority.expectedRolsuper,
    expectedRolbypassrls: authority.expectedRolbypassrls,
  };
  return (
    keys === `${Object.keys(receipt).sort().join(',')},receiptSha256` &&
    digestMatches(JSON.stringify(receipt), authority.receiptSha256) &&
    authority.environmentClass === kind &&
    digestMatches(`${String(options.host)}:${String(options.port)}`, authority.endpointSha256) &&
    digestMatches(ssl && 'ca' in ssl ? String(ssl.ca) : '', authority.caSha256)
  );
}
async function probe(sql: Reserved, options: Options, authority: AdminConnectionAuthority) {
  const rows = await sql<Probe[]>`
    SELECT pg_backend_pid()::int AS pid,
      session_user = current_user AND current_user = ${String(options.username)}
        AND current_database() = ${String(options.database)}
        AND current_setting('application_name') = ${APPLICATION} AS identity_ok,
      (SELECT d.datdba = r.oid FROM pg_database d JOIN pg_roles r
        ON r.rolname = current_user WHERE d.datname = current_database()) AS owner_ok,
      (SELECT r.rolcanlogin AND NOT r.rolreplication
        AND r.rolsuper = ${authority.expectedRolsuper}
        AND r.rolbypassrls = ${authority.expectedRolbypassrls}
        FROM pg_roles r WHERE r.rolname = current_user)
        AND current_user <> ALL(ARRAY['anon','authenticated','service_role',
          'interdomestik_runtime_rls','interdomestik_rls_test']::name[])
        AND has_database_privilege(current_user, current_database(), 'CONNECT')
        AND has_database_privilege(current_user, current_database(), 'CREATE')
        AND has_database_privilege(current_user, current_database(), 'TEMP') AS role_ok,
      NOT pg_is_in_recovery() AND current_setting('transaction_read_only') = 'off'
        AND current_setting('default_transaction_read_only') = 'off' AS state_ok,
      COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS tls,
      current_setting('server_version_num')::int / 10000 AS server_major
  `;
  if (!rows[0]) throw new Error('PROBE_EMPTY');
  return rows[0];
}
function classify(row: Probe, kind: string, expectedPid?: number): string | null {
  if (!row.identity_ok) return 'ADMIN_DB_PREFLIGHT_IDENTITY_REJECTED';
  if (!row.owner_ok || !row.role_ok) return 'ADMIN_DB_PREFLIGHT_ROLE_REJECTED';
  if (!row.state_ok) return 'ADMIN_DB_PREFLIGHT_STATE_REJECTED';
  if (row.tls !== (kind === 'supabase_direct')) return 'ADMIN_DB_PREFLIGHT_TRANSPORT_REJECTED';
  if (row.server_major !== 15 && row.server_major !== 16)
    return 'ADMIN_DB_PREFLIGHT_VERSION_REJECTED';
  if (expectedPid && row.pid !== expectedPid) return 'ADMIN_DB_PREFLIGHT_SESSION_CHANGED';
  return null;
}
function caughtCode(error: unknown, phase: number): string {
  if (error === ABORT) return 'ADMIN_DB_PREFLIGHT_ABORTED';
  return phase === 2 ? 'ADMIN_DB_PREFLIGHT_OPERATION_FAILED' : 'ADMIN_DB_PREFLIGHT_CONNECT_FAILED';
}

export async function withPreflightedAdminConnection(
  env: Readonly<Record<string, unknown>>,
  nowEpochMs: number,
  signal: AbortSignal,
  authority: AdminConnectionAuthority,
  operation: (sql: Reserved, signal: AbortSignal) => Promise<void>
) {
  const resolved = resolveAdminConnectionConfig(env, nowEpochMs);
  if (!resolved.ok) return fail('ADMIN_DB_PREFLIGHT_CONFIG_REJECTED');
  const kind = resolved.config.toJSON().endpoint_class;
  const options = resolved.config.toPostgresOptions();
  if (!authorityMatches(options, kind, authority))
    return fail('ADMIN_DB_PREFLIGHT_AUTHORITY_REJECTED');
  let sql: ReturnType<typeof postgres> | undefined;
  let reserved: Reserved | undefined;
  let closePromise: Promise<void> | undefined;
  let cleanupFailed = false;
  let aborted = false;
  let closed = false;
  let phase = 0;
  // prettier-ignore
  const closeOnce = () => (closePromise ??= (async () => { try { reserved?.release(); } catch { cleanupFailed = true; } try { await sql?.end({ timeout: 1 }); } catch { cleanupFailed = true; } })());
  let resolveAbort!: (value: typeof ABORT) => void;
  // prettier-ignore
  const abort = new Promise<typeof ABORT>(resolve => { resolveAbort = resolve; });
  const onAbort = () => {
    if (closed) return;
    aborted = true;
    resolveAbort(ABORT);
    void closeOnce();
  };
  const race = async <T>(promise: Promise<T>): Promise<T> => {
    // prettier-ignore
    const outcome = await Promise.race([promise.then(value => ({ value }), error => ({ error })), abort]);
    if (outcome === ABORT) throw ABORT;
    if ('error' in outcome) throw outcome.error;
    return outcome.value;
  };
  signal.addEventListener('abort', onAbort, { once: true });
  let code: string | null = null;
  let preflight: Probe | undefined;
  try {
    if (signal.aborted) throw ABORT;
    sql = postgres(options);
    reserved = await race(sql.reserve());
    phase = 1;
    preflight = await race(probe(reserved, options, authority));
    code = classify(preflight, kind);
    if (!code && !signal.aborted) {
      phase = 2;
      await race(operation(reserved, signal));
      phase = 3;
      const postflight = await race(probe(reserved, options, authority));
      code = classify(postflight, kind, preflight.pid);
    }
    if (signal.aborted) throw ABORT;
  } catch (error) {
    code = caughtCode(error, phase);
  } finally {
    await closeOnce();
    closed = true;
    signal.removeEventListener('abort', onAbort);
  }
  if (aborted) code = 'ADMIN_DB_PREFLIGHT_ABORTED';
  if (code) return fail(code, cleanupFailed);
  if (cleanupFailed) return fail('ADMIN_DB_PREFLIGHT_CLEANUP_FAILED');
  // prettier-ignore
  return Object.freeze({ ok: true as const, summary: Object.freeze({ contract_version: 'admin_connection_preflight_v1' as const, endpoint_class: kind, session_reserved: true as const, identity_verified: true as const, database_owner_verified: true as const, writable_primary_verified: true as const, transport_verified: kind === 'local_scratch' ? ('loopback_plaintext' as const) : ('explicit_ca_hostname_verified' as const), server_major: preflight!.server_major as 15 | 16, operation_completed: true as const }) });
}
