import { bindSeedTarget, type SeedDriverTarget } from './seed-target-binding';
import {
  closeSeedTlsClients,
  hasInstalledSeedTlsClients,
  installSeedTlsClients,
} from './seed-target-tls';
export { resetSeedTargetBindingForTests } from './seed-target-binding';
import { DEFAULT_E2E_PASSWORD, E2E_PASSWORD } from './e2e-users';

const PRODUCTION_PROJECT_REF = 'gunosplgrvnvrftudttr';
const LOOPBACK_HOSTS = new Set(['localhost', [127, 0, 0, 1].join('.')]);
// The plaintext local-parity Docker service; a hyphenated name can never be a Supabase ref.
const CI_CONTAINER_HOST = 'ci-postgres';
// postgres 3.4.9 uses host names literally, splits them on ',' and ':' (IPv6 unsupported) and
// rewrites the URL host with String.replace ('$' patterns); Node applies IDNA before DNS lookup.
// Only plain ASCII host names are therefore the same name for the guard and the connection.
const LITERAL_HOST = /^[a-z\d.-]+$/i;
// postgres 3.4.9 parseOptions: these affect transport, not startup identity.
const TRANSPORT_QUERY_KEYS = new Set([
  'ssl',
  'sslmode',
  'sslrootcert',
  'sslnegotiation',
  'idle_timeout',
  'connect_timeout',
  'max_lifetime',
  'max_pipeline',
  'backoff',
  'keep_alive',
  'prepare',
  'debug',
  'fetch_types',
  'publications',
  'target_session_attrs',
  'max',
]);
const HOST_KEYS = new Set(['host', 'hostname', 'hostaddr']);

type SeedEnvironment = Readonly<Record<string, string | undefined>>;
type SeedTargetClassification = 'local' | 'confirmed-ci' | 'confirmed-non-local';

function refuse(classification: string): never {
  throw new Error(`Seed target refused: ${classification}`);
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function production(value: string | undefined): boolean {
  const normalized = decode(value ?? '')
    .trim()
    .toLowerCase();
  return normalized === 'production' || normalized.includes(PRODUCTION_PROJECT_REF);
}

function parse(value: string | undefined): URL | null {
  try {
    return value ? new URL(value) : null;
  } catch {
    return null;
  }
}

function present(values: (string | undefined)[]): string[] {
  return values
    .filter((value): value is string => Boolean(value))
    .map(value => decode(value).toLowerCase());
}

function rejectProduction(env: SeedEnvironment, urls: (URL | null)[]): void {
  const markers = present([
    env.NODE_ENV,
    env.VERCEL_ENV,
    env.SUPABASE_PROJECT_REF,
    env.SUPABASE_REF,
    env.SUPABASE_PROJECT_ID,
    env.USERNAME,
    env.USER,
    env.LOGNAME,
    ...Object.entries(env)
      .filter(([key]) => key.startsWith('PG'))
      .map(([, value]) => value),
  ]);
  // Scan all query values: unknown startup keys must not hide production evidence.
  const urlMarkers = urls.flatMap(url =>
    url ? [url.hostname, url.username, url.pathname, ...url.searchParams.values()] : []
  );
  // Also catch production in malformed/multi-host authorities before the validity refusal.
  const authorities = [env.DATABASE_URL, env.DATABASE_URL_RLS].map(value =>
    value?.split('://')[1]?.split(/[/?]/)[0]?.split('@').at(-1)
  );
  if ([...markers, ...urlMarkers, ...authorities].some(production)) refuse('production');
}

function literalHost(value: string): string {
  if (!LITERAL_HOST.test(value)) refuse('ambiguous');
  return value.toLowerCase();
}

function hostRef(host: string): string | undefined {
  return /^(?:db\.)?([a-z]{20})\.supabase\.co$/.exec(host)?.[1];
}

function userRef(user: string): string | undefined {
  return /^postgres\.([a-z]{20})$/.exec(user)?.[1];
}

function unique(values: string[]): string | undefined {
  const distinct = new Set(values);
  if (distinct.size > 1) refuse('ambiguous');
  return values[0];
}

function databaseTarget(url: URL, env: SeedEnvironment): string {
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) refuse('invalid');
  // Never decode hosts. The driver connects to the literal URL host, else PGHOST, else localhost;
  // it ignores PGHOSTADDR, which may therefore only agree with that host.
  const driverHost = url.hostname || env.PGHOST || 'localhost';
  const hosts = [driverHost, url.hostname, env.PGHOST, env.PGHOSTADDR]
    .filter((value): value is string => Boolean(value))
    .map(literalHost);
  // The driver decodes the URL username once and uses PGUSERNAME/PGUSER literally.
  const users = [decode(url.username), env.PGUSERNAME, env.PGUSER]
    .filter((value): value is string => Boolean(value))
    .map(value => value.toLowerCase());
  for (const [key, value] of url.searchParams) {
    // The driver sends query host keys as startup parameters, never as the connection host.
    if (HOST_KEYS.has(key)) refuse('ambiguous');
    // URLSearchParams already decoded the value once; `username` is only a startup parameter.
    else if (key === 'user') users.push(value.toLowerCase());
    else if (!TRANSPORT_QUERY_KEYS.has(key)) refuse('ambiguous');
  }
  // options/service/socket overrides have no safely resolved single target here.
  if (env.PGOPTIONS || env.PGSERVICE || env.PGSERVICEFILE) refuse('ambiguous');
  const host = unique(hosts);
  unique(users);
  if (!host || /[,/\s]/.test(host)) refuse('ambiguous');
  // Require explicit user identity: do not silently delegate to os.userInfo().username.
  if (!users.length) refuse('invalid');
  const refs = [...hosts.map(hostRef), ...users.map(userRef)].filter((ref): ref is string => !!ref);
  const ref = unique(refs);
  if (ref && hostRef(host) !== ref && !host.endsWith('.pooler.supabase.com')) refuse('ambiguous');
  return ref ?? host;
}

// Match postgres.js parseOptions: username is decoded once, database path stays encoded.
function driverTarget(url: URL, env: SeedEnvironment): SeedDriverTarget {
  const user = decode(url.username) || env.PGUSERNAME || env.PGUSER || '';
  return {
    host: literalHost(url.hostname || env.PGHOST || 'localhost'),
    port: Number.parseInt(url.port || env.PGPORT || '5432'),
    user: url.searchParams.getAll('user').at(-1) ?? user,
    database: url.pathname.slice(1) || env.PGDATABASE || user,
  };
}

// postgres 3.4.9 parseUrl takes the host after the FIRST '@' (decoded; ',' = multihost) while
// WHATWG URL uses the last '@'. Refuse any authority the guard and the driver could read differently.
function assertDriverAuthority(raw: string, url: URL): void {
  if (/[#\\\s]/.test(raw)) refuse('ambiguous');
  const authority = raw.slice(raw.indexOf('://') + 3).split(/[?/]/)[0];
  const parts = authority.split('@');
  const host = parts.at(-1) ?? '';
  if (parts.length > 2 || /[,%$]/.test(host)) refuse('ambiguous');
  if (host.replace(/:\d*$/, '').toLowerCase() !== url.hostname.toLowerCase()) refuse('ambiguous');
}

function assertRemoteSeedPassword(env: SeedEnvironment, effectivePassword: string): void {
  if (
    !effectivePassword ||
    effectivePassword === DEFAULT_E2E_PASSWORD ||
    effectivePassword.length < 20 ||
    env.E2E_PASSWORD?.trim() !== effectivePassword
  ) {
    refuse('non-local-password');
  }
  // Require three of lowercase, uppercase, digit and non-whitespace symbol.
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d\s]/];
  if (classes.filter(pattern => pattern.test(effectivePassword)).length < 3) {
    refuse('non-local-password');
  }
}

/** Process-bound preflight; refusals expose only a classification, never credentials. */
export function assertSeedTargetAllowed(
  env: SeedEnvironment,
  effectivePassword: string = E2E_PASSWORD
): SeedTargetClassification {
  const database = parse(env.DATABASE_URL);
  const rls = parse(env.DATABASE_URL_RLS);
  const advisory = [parse(env.SUPABASE_URL), parse(env.NEXT_PUBLIC_SUPABASE_URL)];
  rejectProduction(env, [database, rls, ...advisory]);
  // db.ts keeps a defined-but-empty RLS URL, which the driver resolves to localhost defaults.
  if (!database || (env.DATABASE_URL_RLS !== undefined && !rls)) refuse('invalid');
  assertDriverAuthority(env.DATABASE_URL ?? '', database);
  if (rls) assertDriverAuthority(env.DATABASE_URL_RLS ?? '', rls);
  const target = databaseTarget(database, env);
  const targets = [target];
  if (rls) targets.push(databaseTarget(rls, env));
  unique(targets);
  const expected = { admin: driverTarget(database, env), rls: driverTarget(rls ?? database, env) };
  if (LOOPBACK_HOSTS.has(target)) {
    bindSeedTarget(env, expected, false);
    return 'local';
  }
  if (env.SEED_TARGET_CONFIRM !== `plan070:${target}`) refuse('non-local-unconfirmed');
  // Only the exact, confirmed CI container keeps the local fixture-password and plaintext policy.
  if (target === CI_CONTAINER_HOST) {
    bindSeedTarget(env, expected, false);
    return 'confirmed-ci';
  }
  assertRemoteSeedPassword(env, effectivePassword);
  bindSeedTarget(env, expected, true);
  return 'confirmed-non-local';
}

/** full/workload hash fixed public fixture passwords, so they never run on a non-local target. */
export function assertSeedModeAllowed(
  mode: string,
  classification: SeedTargetClassification
): void {
  if (classification !== 'local' && mode !== 'e2e' && mode !== 'golden') {
    refuse('non-local-mode');
  }
}

/** Validate both sides of module evaluation, before returning any database capability. */
export async function importSeedDatabase(): Promise<typeof import('./db')> {
  try {
    if (
      assertSeedTargetAllowed(process.env) === 'confirmed-non-local' &&
      !hasInstalledSeedTlsClients()
    ) {
      installSeedTlsClients(process.env);
    }
    const database = await import('./db');
    assertSeedTargetAllowed(process.env);
    return database;
  } catch (error) {
    await closeSeedTlsClients();
    throw error;
  }
}

/** Command entry points own cleanup; reusable golden/full/workload/packs share their lifetime. */
export async function closeSeedTargetClients(): Promise<void> {
  await closeSeedTlsClients();
}

/** Report an uncaught failure, close the clients this process installed, then exit. */
export async function exitSeed(code: number, failure?: unknown): Promise<never> {
  if (failure !== undefined) console.error('Seed failed:', failure);
  await closeSeedTlsClients();
  process.exit(code);
}
