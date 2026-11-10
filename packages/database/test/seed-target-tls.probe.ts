import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkServerIdentity } from 'node:tls';
import postgres from 'postgres';
import { TEST_CA_PEM } from './seed-tls-ca.fixture';
import { verifyPoolParity } from './seed-target-tls-parity.probe';

const require = createRequire(import.meta.url);
const scenario = process.argv[2];
const host = 'session.pooler.supabase.com';
const remote = `postgres://fixture:private-password@${host}/db`;
const globals = globalThis as any;
const directory = mkdtempSync(join(tmpdir(), 'u3-private-'));
const caPath = join(directory, 'root.pem');
writeFileSync(caPath, TEST_CA_PEM);
process.env = {
  NODE_ENV: 'test',
  NODE_TEST_CONTEXT: 'child-v8',
  DATABASE_URL: remote,
  SEED_TARGET_CONFIRM: `plan070:${host}`,
  SEED_TARGET_SSL_ROOT_CERT: caPath,
  E2E_PASSWORD: 'U3-fixture-password-A1-strong',
};
const calls: { url: string; options: postgres.Options<{}>; client: postgres.Sql }[] = [];
let constructions = 0;
let sockets = 0;
let evaluations = 0;
let local = scenario === 'local';
let checkingOrder = false;
const ended = new Map<postgres.Sql, number>();
globals.seedTlsProbeDriver = (url: string, options: postgres.Options<{}>) => {
  constructions++;
  if (scenario === 'partial-construction' && constructions === 2)
    throw new Error('private-password');
  const client = postgres(url, {
    ...options,
    socket: () => {
      sockets++;
      throw new Error('Unexpected socket');
    },
  });
  const end = client.end;
  client.end = async (...args) => {
    ended.set(client, (ended.get(client) ?? 0) + 1);
    await end(...args);
    if (scenario === 'cleanup-error' && client === calls[0].client)
      throw new Error('private-password');
  };
  calls.push({ url, options, client });
  return client;
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'postgres') return { url: 'u3:driver', shortCircuit: true };
    if (/\/db(?:\.ts)?$/.test(specifier) && checkingOrder) {
      evaluations++;
      if (local) {
        assert.equal(globals.queryClientAdmin, undefined);
        assert.equal(globals.queryClientRls, undefined);
        return { url: 'u3:local-db', shortCircuit: true };
      }
      assert.ok(globals.queryClientAdmin, 'install admin before database evaluation');
      assert.ok(globals.queryClientRls, 'install RLS before database evaluation');
      if (scenario === 'drift') process.env.SEED_TARGET_SSL_ROOT_CERT = caPath + '-changed';
    }
    // Identity seam: expose the raw pool db.ts hands to the RLS lifetime adapter.
    if (specifier === './transaction-lifetime' && context.parentURL?.endsWith('/db.ts')) {
      return { url: 'u3:lifetime', shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    const sources = new Map([
      ['u3:driver', 'module.exports = globalThis.seedTlsProbeDriver;'],
      ['u3:lifetime', 'exports.withTransactionLifetime = client => client;'],
      ['u3:local-db', 'module.exports = {};'],
    ]);
    const source = sources.get(url);
    return source === undefined
      ? next(url, context)
      : { format: 'commonjs', source, shortCircuit: true };
  },
});
const guard = require('../src/seed-target-guard.ts');
// Baseline probes still exercise origin/main when the new helper does not exist.
const tls = existsSync(new URL('../src/seed-target-tls.ts', import.meta.url))
  ? require('../src/seed-target-tls.ts')
  : {};
const refusal = { message: 'Seed target refused: non-local-tls' };
const verify = (client: postgres.Sql) => {
  const ssl = client.options.ssl;
  assert.ok(ssl && typeof ssl === 'object');
  assert.equal(ssl.ca, TEST_CA_PEM);
  assert.equal(ssl.rejectUnauthorized, true);
  assert.equal(ssl.servername, host);
  assert.equal(ssl.checkServerIdentity, checkServerIdentity);
};
const failures: Record<string, string | undefined> = {
  missing: undefined,
  'empty-variable': '',
  relative: 'private-relative.pem',
  unreadable: caPath + '-absent',
  empty: '',
  'non-pem': 'private-content',
  corrupt: '-----BEGIN CERTIFICATE-----\nYWJj\n-----END CERTIFICATE-----',
  mixed: TEST_CA_PEM + 'private-content',
  system: 'system',
};
async function verifyCaRefusal() {
  const value = failures[scenario];
  if (['empty', 'non-pem', 'corrupt', 'mixed'].includes(scenario)) writeFileSync(caPath, value!);
  else if (value === undefined) delete process.env.SEED_TARGET_SSL_ROOT_CERT;
  else process.env.SEED_TARGET_SSL_ROOT_CERT = value;
  await assert.rejects(guard.importSeedDatabase(), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, refusal.message);
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(constructions, 0);
  assert.equal(evaluations, 0);
}
async function verifyExistingClients() {
  guard.assertSeedTargetAllowed(process.env);
  const sentinel = { untouched: true };
  if (scenario !== 'existing-rls') globals.queryClientAdmin = sentinel;
  if (scenario !== 'existing-admin') globals.queryClientRls = sentinel;
  assert.equal(typeof tls.installSeedTlsClients, 'function');
  assert.throws(() => tls.installSeedTlsClients(process.env), refusal);
  assert.equal(constructions, 0);
  await tls.closeSeedTlsClients();
  if (scenario !== 'existing-rls') assert.equal(globals.queryClientAdmin, sentinel);
  if (scenario !== 'existing-admin') assert.equal(globals.queryClientRls, sentinel);
}
async function verifyCachedMismatch() {
  guard.assertSeedTargetAllowed(process.env);
  globals.queryClientAdmin = {
    options: {
      host: [host],
      port: [5432],
      user: 'fixture',
      database: 'db',
      ssl: false,
    },
  };
  await assert.rejects(guard.importSeedDatabase(), {
    message: 'Seed target refused: client-mismatch',
  });
  assert.equal(constructions, 0);
}
async function verifyLocalImport() {
  process.env.DATABASE_URL = 'postgres://fixture@localhost/db';
  delete process.env.SEED_TARGET_SSL_ROOT_CERT;
  checkingOrder = true;
  await guard.importSeedDatabase();
  assert.equal(constructions, 0);
  assert.equal(globals.queryClientAdmin, undefined);
  assert.equal(globals.queryClientRls, undefined);
  guard.resetSeedTargetBindingForTests();
  local = false;
  process.env.DATABASE_URL = remote;
  process.env.SEED_TARGET_SSL_ROOT_CERT = caPath;
}
async function verifyRemoteImport() {
  if (
    [
      'separate-rls',
      'cleanup',
      'cleanup-replaced',
      'cleanup-error',
      'partial-construction',
    ].includes(scenario)
  ) {
    process.env.DATABASE_URL_RLS = `postgres://runtime@${host}/db`;
  }
  checkingOrder = true;
  if (scenario === 'drift' || scenario === 'partial-construction') {
    await assert.rejects(
      guard.importSeedDatabase(),
      scenario === 'drift' ? { message: 'Seed target refused: target-changed' } : refusal
    );
    assert.equal(globals.queryClientAdmin, undefined);
    assert.equal(globals.queryClientRls, undefined);
    assert.ok(calls.length > 0);
    for (const { client } of calls) assert.equal(ended.get(client), 1);
    return;
  }
  const db = await guard.importSeedDatabase();
  const admin = globals.queryClientAdmin;
  const rls = globals.queryClientRls;
  verify(admin);
  verify(rls);
  assert.equal(db.dbAdmin.$client, admin);
  assert.equal(db.dbRls.$client, rls);
  assert.equal(admin === rls, !process.env.DATABASE_URL_RLS);
  assert.equal(constructions, process.env.DATABASE_URL_RLS ? 2 : 1);
  await guard.importSeedDatabase();
  assert.equal(globals.queryClientAdmin, admin);
  if (scenario.startsWith('cleanup')) await verifyCleanup(admin, rls);
}
async function verifyCleanup(admin: postgres.Sql, rls: postgres.Sql) {
  const replacement = {
    end: () => {
      throw new Error('Must not end foreign client');
    },
  };
  if (scenario === 'cleanup-replaced') globals.queryClientAdmin = replacement;
  assert.equal(typeof guard.closeSeedTargetClients, 'function');
  if (scenario === 'cleanup-error')
    await assert.rejects(guard.closeSeedTargetClients(), /Seed target cleanup failed/);
  else await guard.closeSeedTargetClients();
  assert.equal(globals.queryClientAdmin, scenario === 'cleanup-replaced' ? replacement : undefined);
  assert.equal(globals.queryClientRls, undefined);
  assert.equal(ended.get(admin), 1);
  assert.equal(ended.get(rls), 1);
  await guard.closeSeedTargetClients();
  assert.equal(ended.get(admin), 1);
}
async function run() {
  if (scenario === 'ordering') process.env.DATABASE_URL = remote + '?sslmode=disable';
  if (scenario === 'mixed-case-host')
    process.env.DATABASE_URL = remote.replace(host, host.toUpperCase());
  if (scenario in failures) return verifyCaRefusal();
  if (scenario.startsWith('existing-')) return verifyExistingClients();
  if (scenario === 'cached-mismatch') return verifyCachedMismatch();
  if (local) await verifyLocalImport();
  if (scenario === 'parity') {
    return verifyPoolParity({ require, host, globals, calls, ended, guard, tls, verify });
  }
  await verifyRemoteImport();
}
run()
  .then(() => assert.equal(sockets, 0))
  .finally(async () => {
    hooks.deregister();
    // Each shutdown must settle before checking whether the next client was ended.
    await calls.reduce(
      (previous, { client }) =>
        previous.then(() => {
          if (!ended.has(client)) return client.end().catch(() => undefined);
        }),
      Promise.resolve()
    );
    rmSync(directory, { recursive: true, force: true });
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
