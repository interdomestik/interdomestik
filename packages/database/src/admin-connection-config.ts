import { X509Certificate } from 'node:crypto';
import { checkServerIdentity } from 'node:tls';
import { inspect } from 'node:util';
import type postgres from 'postgres';
type LockedOptions = postgres.Options<Record<never, never>> & {
  sslnegotiation: null;
  max_pipeline: 1;
};
const NOOP = (): void => {};
const STRUCTURAL = /[\u0000-\u0020\u007f:/?#[\]@,\\]/;
const DIRECT_HOST = /^db\.[a-z0-9]{20}\.supabase\.co$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_CA_BYTES = 65_536;
function reject<const C extends string, const F extends string>(code: C, field: F) {
  return Object.freeze({ ok: false as const, error: Object.freeze({ code, field }) });
}
function parseUrl(raw: string) {
  if (raw.length === 0 || raw.length > 8192 || /[\u0000-\u0020\u007f]/.test(raw)) return null;
  const match = /^(postgres|postgresql):\/\/([^/?#]+)\/([^/?#]+)$/.exec(raw);
  if (!match) return null;
  const [, , authority, rawDatabase] = match;
  if (authority.includes(',') || (authority.match(/@/g) ?? []).length !== 1) return null;
  const [credentials, rawHostPort] = authority.split('@');
  const separator = credentials.indexOf(':');
  if (separator < 1 || separator === credentials.length - 1 || rawHostPort.includes('%'))
    return null;
  const hostMatch = rawHostPort.startsWith('[')
    ? /^(\[[\da-f:.]+\]):(\d+)$/.exec(rawHostPort)
    : /^([^:]+):(\d+)$/.exec(rawHostPort);
  if (!hostMatch || !/^[\x21-\x7e]+$/.test(hostMatch[1]) || hostMatch[1].endsWith('.')) return null;
  const port = Number(hostMatch[2]);
  if (String(port) !== hostMatch[2] || port < 1 || port > 65_535) return null;
  try {
    const username = decodeURIComponent(credentials.slice(0, separator));
    const password = decodeURIComponent(credentials.slice(separator + 1));
    const database = decodeURIComponent(rawDatabase);
    const url = new URL(raw);
    if ([username, password, database].some(value => !value || STRUCTURAL.test(value))) return null;
    if (hostMatch[1] !== hostMatch[1].toLowerCase() || url.hostname !== hostMatch[1]) return null;
    if (url.port !== hostMatch[2] || url.pathname !== `/${rawDatabase}`) return null;
    return { host: url.hostname, port, database, username, password };
  } catch {
    return null;
  }
}
function parseCa(value: unknown, nowEpochMs: number): string | null {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_CA_BYTES / 3) * 4) return null;
  if (!BASE64.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > MAX_CA_BYTES || bytes.toString('base64') !== value)
    return null;
  const pem = bytes.toString('utf8');
  if (!Buffer.from(pem).equals(bytes)) return null;
  const begins = (pem.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length;
  const ends = (pem.match(/-----END CERTIFICATE-----/g) ?? []).length;
  if (begins !== 1 || ends !== 1) return null;
  if (!/^\s*-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----\s*$/.test(pem)) return null;
  try {
    const certificate = new X509Certificate(pem);
    const validFrom = Date.parse(certificate.validFrom);
    const validTo = Date.parse(certificate.validTo);
    return certificate.ca && nowEpochMs >= validFrom && nowEpochMs <= validTo ? pem : null;
  } catch {
    return null;
  }
}
function summaryFor(local: boolean) {
  return Object.freeze({
    contract_version: 'admin_connection_config_v1' as const,
    endpoint_class: local ? ('local_scratch' as const) : ('supabase_direct' as const),
    transport_policy: local
      ? ('unauthenticated_loopback_test_only' as const)
      : ('explicit_ca_hostname_verified' as const),
    connection_count: 1 as const,
    target_session: 'primary' as const,
  });
}
type ParsedUrl = NonNullable<ReturnType<typeof parseUrl>>;
type Values = ParsedUrl & { ca?: string; summary: ReturnType<typeof summaryFor> };
class AdminConnectionConfig {
  readonly #values: Readonly<Values>;
  constructor(values: Values) {
    this.#values = Object.freeze(values);
    Object.freeze(this);
  }
  toJSON(): ReturnType<typeof summaryFor> {
    return this.#values.summary;
  }
  [inspect.custom](): ReturnType<typeof summaryFor> {
    return this.toJSON();
  }
  toPostgresOptions(): LockedOptions {
    const { ca, summary: _summary, ...credentials } = this.#values;
    const ssl = ca
      ? Object.freeze({
          ca,
          rejectUnauthorized: true,
          servername: this.#values.host,
          checkServerIdentity,
        })
      : false;
    return Object.freeze({
      ...credentials,
      path: undefined,
      ssl,
      sslnegotiation: null,
      max: 1,
      idle_timeout: 0,
      connect_timeout: 5,
      max_lifetime: null,
      max_pipeline: 1,
      backoff: false,
      keep_alive: 30,
      prepare: false,
      debug: false,
      fetch_types: true,
      publications: 'none',
      target_session_attrs: 'primary',
      types: Object.freeze({}),
      transform: Object.freeze({ undefined: undefined }),
      connection: Object.freeze({ application_name: 'interdomestik_admin_config_v1' }),
      onnotice: NOOP,
      onparameter: NOOP,
    });
  }
}
export function resolveAdminConnectionConfig(
  env: Readonly<Record<string, unknown>>,
  nowEpochMs: number
) {
  const raw = env.DATABASE_URL;
  if (raw === undefined) return reject('ADMIN_DB_CONFIG_MISSING', 'url');
  if (typeof raw !== 'string') return reject('ADMIN_DB_CONFIG_URL_INVALID', 'url');
  const values = parseUrl(raw);
  if (!values) return reject('ADMIN_DB_CONFIG_URL_INVALID', 'url');
  const local = values.host === '127.0.0.1';
  if (!local && (!DIRECT_HOST.test(values.host) || values.port !== 5432))
    return reject('ADMIN_DB_CONFIG_ENDPOINT_REJECTED', 'endpoint');
  const scratch = env.ADMIN_DB_LOCAL_SCRATCH === '1';
  const localAuthorized =
    env.NODE_ENV === 'test' && scratch && values.database.startsWith('interdomestik_admin_config_');
  if (local && !localAuthorized)
    return reject('ADMIN_DB_CONFIG_LOCAL_AUTHORITY_REQUIRED', 'local_authority');
  if (!local && env.DATABASE_ADMIN_CA_PEM_BASE64 === undefined)
    return reject('ADMIN_DB_CONFIG_CA_REQUIRED', 'ca');
  const ca = local ? undefined : parseCa(env.DATABASE_ADMIN_CA_PEM_BASE64, nowEpochMs);
  if (ca === null) return reject('ADMIN_DB_CONFIG_CA_INVALID', 'ca');
  const config = new AdminConnectionConfig({ ...values, ca, summary: summaryFor(local) });
  return Object.freeze({ ok: true as const, config });
}
