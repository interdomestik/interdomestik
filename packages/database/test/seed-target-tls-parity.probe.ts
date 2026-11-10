import assert from 'node:assert/strict';
import type postgres from 'postgres';

type ParityContext = {
  require: NodeJS.Require;
  host: string;
  globals: { queryClientAdmin?: unknown; queryClientRls?: unknown };
  calls: { url: string; options: postgres.Options<{}>; client: postgres.Sql }[];
  ended: ReadonlyMap<postgres.Sql, number>;
  guard: Pick<
    typeof import('../src/seed-target-guard'),
    'resetSeedTargetBindingForTests' | 'assertSeedTargetAllowed'
  >;
  tls: Pick<
    typeof import('../src/seed-target-tls'),
    'installSeedTlsClients' | 'closeSeedTlsClients'
  >;
  verify: (client: postgres.Sql) => void;
};

async function verifyPoolValue(value: string | undefined, context: ParityContext): Promise<void> {
  const { require, host, globals, calls, ended, guard, tls, verify } = context;
  for (const key of [
    'DB_MAX_CONNECTIONS',
    'DB_IDLE_TIMEOUT',
    'DB_CONNECT_TIMEOUT',
    'DB_MAX_LIFETIME',
  ]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete process.env.SEED_TARGET_CONFIRM;
  const dbPath = require.resolve('../src/db.ts');
  delete require.cache[dbPath];
  require(dbPath);
  const ordinary = calls.at(-1)!;
  delete globals.queryClientAdmin;
  delete globals.queryClientRls;
  process.env.SEED_TARGET_CONFIRM = `plan070:${host}`;
  guard.resetSeedTargetBindingForTests();
  guard.assertSeedTargetAllowed(process.env);
  assert.equal(typeof tls.installSeedTlsClients, 'function');
  tls.installSeedTlsClients(process.env);
  const seeded = calls.at(-1)!;
  verify(seeded.client);
  assert.equal(seeded.url, ordinary.url);
  const { ssl: _a, onnotice: a, ...expected } = ordinary.options;
  const { ssl: _b, onnotice: b, ...actual } = seeded.options;
  assert.deepEqual(actual, expected);
  assert.equal(a!({} as any), undefined);
  assert.equal(b!({} as any), undefined);
  await tls.closeSeedTlsClients();
  assert.equal(ended.get(seeded.client), 1);
}

export function verifyPoolParity(context: ParityContext): Promise<void> {
  // Values share environment, module cache and clients; finish cleanup before the next value.
  return [undefined, '7', '0', '-1', 'bad', '12tail', '1.9'].reduce(
    (previous, value) => previous.then(() => verifyPoolValue(value, context)),
    Promise.resolve()
  );
}
