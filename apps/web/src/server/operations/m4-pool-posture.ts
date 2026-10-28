import type postgres from 'postgres';
import { checkServerIdentity, type PeerCertificate } from 'node:tls';

export type M4PoolTarget = Readonly<{
  url: string;
  login: string;
  database: string;
  serverKey: string;
}>;

// Called only while constructing the private bootstrap, never from an operation payload.
export function captureM4PoolTarget(value: unknown, loopbackQualification: boolean): M4PoolTarget {
  try {
    if (typeof value !== 'string' || value.length > 8192) throw new Error();
    const url = new URL(value);
    const login = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const database = decodeURIComponent(url.pathname.slice(1));
    const host = url.hostname.toLowerCase();
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.search ||
      url.hash ||
      !login ||
      !password ||
      !database ||
      /[\u0000-\u001f\u007f]/u.test(login + password + database) ||
      url.pathname.slice(1).includes('/') ||
      // The pinned driver's URL parser retains encoded database names and splits IPv6 hosts.
      // These endpoint forms require separate qualification rather than silent reinterpretation.
      url.pathname.slice(1) !== database ||
      !/^[a-z0-9][a-z0-9.-]*$/u.test(host) ||
      (loopbackQualification && host !== '127.0.0.1' && host !== 'localhost')
    )
      throw new Error();
    // postgres.js otherwise consults PGPORT when the serialized URL omits its port.
    url.port ||= '5432';
    return Object.freeze({
      url: url.href,
      login,
      database,
      serverKey: JSON.stringify([host, url.port || '5432', database]),
    });
  } catch {
    // Never include a credential-bearing URL or the URL parser's original error.
    throw new Error('Invalid private M4 database configuration');
  }
}

// Bind the standard Node certificate identity check to the captured endpoint, not a
// hostname inferred from the driver's already connected socket. No request supplies a callback.
export function captureM4DatabaseTls(target: M4PoolTarget) {
  const expectedHostname = new URL(target.url).hostname;
  return Object.freeze({
    rejectUnauthorized: true,
    checkServerIdentity(_driverHostname: string, certificate: PeerCertificate) {
      return checkServerIdentity(expectedHostname, certificate);
    },
  });
}

// These installed-driver fallbacks select unqualified behavior even with a complete URL.
// Check again immediately before constructing pools: process.env is mutable in this process.
export function assertM4DriverEnvironment(): void {
  const options = [
    'SSLNEGOTIATION',
    'IDLE_TIMEOUT',
    'MAX_LIFETIME',
    'MAX_PIPELINE',
    'BACKOFF',
    'KEEP_ALIVE',
    'PREPARE',
    'DEBUG',
    'FETCH_TYPES',
    'PUBLICATIONS',
    'TARGET_SESSION_ATTRS',
    'TARGETSESSIONATTRS',
  ];
  if (options.some(option => Boolean(process.env[`PG${option}`])))
    throw new Error('Unsupported private M4 driver environment');
}

// Every restriction is enforced in PostgreSQL before row decoding. No boolean returned by
// a potentially incorrect driver parser can turn a forbidden role into a passing gate.
export async function assertM4PoolPosture(
  client: postgres.Sql,
  target: M4PoolTarget
): Promise<void> {
  const rows = await client<{ gate: number }[]>`
    select 1 OPERATOR(pg_catalog./) case when
      CAST(checked.rolname AS pg_catalog.text) OPERATOR(pg_catalog.=) CAST(${target.login} AS pg_catalog.text)
      and session_user OPERATOR(pg_catalog.=) current_user
      and pg_catalog.current_setting('client_connection_check_interval') OPERATOR(pg_catalog.=) '100ms'
      and CAST(pg_catalog.current_database() AS pg_catalog.text) OPERATOR(pg_catalog.=) CAST(${target.database} AS pg_catalog.text)
      and checked.rolcanlogin and not checked.rolsuper and not checked.rolbypassrls
      and not checked.rolcreatedb and not checked.rolcreaterole
      and not checked.rolreplication and not checked.rolinherit
      and not exists (
        select 1 from pg_catalog.pg_auth_members as membership
        where membership.member OPERATOR(pg_catalog.=) checked.oid
      )
      and not exists (
        select 1 from pg_catalog.pg_class as relation
        where relation.relowner OPERATOR(pg_catalog.=) checked.oid
      )
      and not exists (
        select 1 from pg_catalog.pg_proc as routine
        join pg_catalog.pg_namespace as namespace
          on namespace.oid OPERATOR(pg_catalog.=) routine.pronamespace
        where routine.prosecdef
          and namespace.nspname OPERATOR(pg_catalog.<>) CAST('pg_catalog' AS pg_catalog.name)
          and namespace.nspname OPERATOR(pg_catalog.<>) CAST('information_schema' AS pg_catalog.name)
          and pg_catalog.has_function_privilege(checked.oid, routine.oid, 'EXECUTE')
      )
      then 1 else 0 end as gate
    from pg_catalog.pg_roles as checked
    where checked.rolname OPERATOR(pg_catalog.=) session_user
    limit 1
  `;
  if (rows.length !== 1 || rows[0]?.gate !== 1) throw new Error('Private M4 pool posture denied');
}
