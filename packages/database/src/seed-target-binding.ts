import { createHash } from 'node:crypto';

export type SeedDriverTarget = Readonly<{
  host: string;
  port: number;
  user: string;
  database: string;
}>;
type ExpectedClients = Readonly<{ admin: SeedDriverTarget; rls: SeedDriverTarget }>;
type Binding = ExpectedClients & Readonly<{ fingerprint: string }>;
type BindingHolder = { binding?: Binding };
type DriverOptions = { host?: unknown; port?: unknown; user?: unknown; database?: unknown };
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
] as const;
const seedGlobal = globalThis as typeof globalThis & {
  [TARGET_BINDING]?: BindingHolder;
  queryClientAdmin?: unknown;
  queryClientRls?: unknown;
};
const holder: BindingHolder = seedGlobal[TARGET_BINDING] ?? {};
Object.defineProperty(seedGlobal, TARGET_BINDING, {
  value: holder,
  enumerable: false,
  configurable: false,
  writable: false,
});

function refuse(classification: string): never {
  throw new Error(`Seed target refused: ${classification}`);
}

function matchesTarget(options: DriverOptions | undefined, expected: SeedDriverTarget): boolean {
  const host = options?.host;
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
    options?.user === expected.user &&
    options?.database === expected.database
  );
}

function assertClientTarget(client: unknown, expected: SeedDriverTarget): void {
  if (client == null) return;
  try {
    const options = (client as { options?: DriverOptions }).options;
    if (!matchesTarget(options, expected)) refuse('client-mismatch');
  } catch {
    // Unreadable options must never propagate driver errors or credentials.
    refuse('client-mismatch');
  }
}

export function bindSeedTarget(
  env: Readonly<Record<string, string | undefined>>,
  expected: ExpectedClients
): void {
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(TARGET_INPUTS.map(key => env[key] ?? null)))
    .digest('hex');
  const bound = holder.binding;
  if (bound) {
    if (bound.fingerprint !== fingerprint) refuse('target-changed');
    assertClientTarget(seedGlobal.queryClientAdmin, bound.admin);
    assertClientTarget(seedGlobal.queryClientRls, bound.rls);
    return;
  }
  if (seedGlobal.queryClientAdmin != null || seedGlobal.queryClientRls != null) {
    refuse('unbound-client');
  }
  holder.binding = Object.freeze({
    fingerprint,
    admin: Object.freeze(expected.admin),
    rls: Object.freeze(expected.rls),
  });
}

/** Test isolation only; the permanent global slot cannot be deleted or replaced. */
export function resetSeedTargetBindingForTests(): void {
  if (!process.env.NODE_TEST_CONTEXT) refuse('test-reset-only');
  holder.binding = undefined;
}
