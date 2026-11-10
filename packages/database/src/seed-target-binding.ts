import { createHash } from 'node:crypto';
import { checkServerIdentity, type ConnectionOptions } from 'node:tls';

export type SeedDriverTarget = Readonly<{
  host: string;
  port: number;
  user: string;
  database: string;
}>;
type ExpectedClients = Readonly<{ admin: SeedDriverTarget; rls: SeedDriverTarget }>;
type Binding = ExpectedClients &
  Readonly<{
    fingerprint: string;
    verifyTls: boolean;
    rootCert: string | undefined;
  }>;
type SeedEnvironment = Readonly<Record<string, string | undefined>>;
type BindingFacade = Readonly<{
  bind: (env: SeedEnvironment, expected: ExpectedClients) => void;
  resetForTests: () => void;
}>;
type DriverOptions = {
  host?: unknown;
  port?: unknown;
  user?: unknown;
  database?: unknown;
  connection?: unknown;
  ssl?: unknown;
};
// db.ts supplies no startup overrides; postgres.js supplies application_name by default.
// Explicit identity overrides are permitted only when the effective identity still matches.
const STARTUP_KEYS = new Set(['application_name', 'user', 'database']);
const LOOPBACK_IPV6 = ['', '', 1].join(':');
const TARGET_BINDING = Symbol.for('interdomestik.seed-target-binding');
const TARGET_INPUTS = [
  'DATABASE_URL',
  'DATABASE_URL_RLS',
  'PGHOST',
  'PGHOSTADDR',
  'PGPORT',
  'PGUSER',
  'PGUSERNAME',
  'PGDATABASE',
  'SEED_TARGET_CONFIRM',
  'SEED_TARGET_SSL_ROOT_CERT',
] as const;
const seedGlobal = globalThis as typeof globalThis & {
  [TARGET_BINDING]?: BindingFacade;
  queryClientAdmin?: unknown;
  queryClientRls?: unknown;
};
function refuse(classification: string): never {
  throw new Error(`Seed target refused: ${classification}`);
}

function startupIdentity(options: DriverOptions): { user: unknown; database: unknown } | null {
  const connection = options.connection ?? {};
  if (typeof connection !== 'object' || Array.isArray(connection)) return null;
  const startup = connection as Record<string, unknown>;
  if (Object.keys(startup).some(key => !STARTUP_KEYS.has(key))) return null;
  // Startup values are NUL-terminated; an embedded NUL would inject further startup keys.
  const values = [...Object.values(startup), options.user, options.database];
  if (values.some(value => value !== undefined && !isStartupString(value))) return null;
  return { user: startup.user ?? options.user, database: startup.database ?? options.database };
}

function isStartupString(value: unknown): value is string {
  return typeof value === 'string' && !value.includes('\0');
}

function matchesTarget(options: DriverOptions | undefined, expected: SeedDriverTarget): boolean {
  if (!options) return false;
  const identity = startupIdentity(options);
  const host = options.host;
  const port = options?.port;
  return (
    Array.isArray(host) &&
    host.length === 1 &&
    typeof host[0] === 'string' &&
    /^[a-z\d.-]+$/i.test(host[0]) &&
    host[0].toLowerCase() === expected.host &&
    Array.isArray(port) &&
    port.length === 1 &&
    port[0] === expected.port &&
    identity?.user === expected.user &&
    identity?.database === expected.database
  );
}

function matchesTls(
  options: DriverOptions | undefined,
  expected: SeedDriverTarget,
  rootCert: string | undefined
): boolean {
  const ssl = options?.ssl as ConnectionOptions | undefined;
  return (
    !!ssl &&
    typeof ssl === 'object' &&
    ssl.rejectUnauthorized === true &&
    ssl.servername === expected.host &&
    (ssl.checkServerIdentity === undefined || ssl.checkServerIdentity === checkServerIdentity) &&
    !!rootCert &&
    typeof ssl.ca === 'string' &&
    !!ssl.ca.trim()
  );
}

function assertClientTarget(client: unknown, expected: SeedDriverTarget, bound: Binding): void {
  if (client == null) return;
  try {
    const options = (client as { options?: DriverOptions }).options;
    if (
      !matchesTarget(options, expected) ||
      (bound.verifyTls && !matchesTls(options, expected, bound.rootCert))
    )
      refuse('client-mismatch');
  } catch {
    // Unreadable options must never propagate driver errors or credentials.
    refuse('client-mismatch');
  }
}

function createBindingFacade(): BindingFacade {
  let bound: Binding | undefined;
  return Object.freeze({
    bind(env: SeedEnvironment, expected: ExpectedClients): void {
      const fingerprint = createHash('sha256')
        .update(JSON.stringify(TARGET_INPUTS.map(key => env[key] ?? null)))
        .digest('hex');
      if (bound) {
        if (bound.fingerprint !== fingerprint) refuse('target-changed');
        assertClientTarget(seedGlobal.queryClientAdmin, bound.admin, bound);
        assertClientTarget(seedGlobal.queryClientRls, bound.rls, bound);
        return;
      }
      if (seedGlobal.queryClientAdmin != null || seedGlobal.queryClientRls != null) {
        refuse('unbound-client');
      }
      bound = Object.freeze({
        fingerprint,
        verifyTls:
          env.SEED_TARGET_CONFIRM !== undefined &&
          !['localhost', [127, 0, 0, 1].join('.'), LOOPBACK_IPV6, `[${LOOPBACK_IPV6}]`].includes(
            expected.admin.host
          ),
        rootCert: env.SEED_TARGET_SSL_ROOT_CERT,
        admin: Object.freeze(expected.admin),
        rls: Object.freeze(expected.rls),
      });
    },
    resetForTests(): void {
      if (!process.env.NODE_TEST_CONTEXT) refuse('test-reset-only');
      bound = undefined;
    },
  });
}

const facade = seedGlobal[TARGET_BINDING] ?? createBindingFacade();
Object.defineProperty(seedGlobal, TARGET_BINDING, {
  value: facade,
  enumerable: false,
  configurable: false,
  writable: false,
});
export const bindSeedTarget = facade.bind;
/** Test isolation only; the frozen facade exposes no mutable binding state. */
export const resetSeedTargetBindingForTests = facade.resetForTests;
