import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TEST_CA_PEM } from './seed-tls-ca.fixture';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { compareSync } from 'bcryptjs';
import { createSeedConfig } from '../src/seed-types';
import { db as fixtureDb, writes } from './seed-agent-pack.fixture';

test('agent credentials use cached E2E password and reject later environment drift', async t => {
  const strongOverride = ['x'.repeat(18), 'A', '1'].join('');
  const staging = 's'.repeat(20);
  const directory = mkdtempSync(join(tmpdir(), 'seed-agent-tls-'));
  const caPath = join(directory, 'ca.pem');
  writeFileSync(caPath, TEST_CA_PEM);
  const previousEnv = process.env;
  const testEnv = { NODE_ENV: 'test' as const, NODE_TEST_CONTEXT: previousEnv.NODE_TEST_CONTEXT };
  const clients = globalThis as typeof globalThis & {
    queryClientAdmin?: unknown;
    queryClientRls?: unknown;
  };
  const previousAdmin = Object.getOwnPropertyDescriptor(clients, 'queryClientAdmin');
  const previousRls = Object.getOwnPropertyDescriptor(clients, 'queryClientRls');
  process.env = {
    ...testEnv,
    DATABASE_URL: `postgres://fixture@db.${staging}.supabase.co/db`,
    SEED_TARGET_CONFIRM: `plan070:${staging}`,
    SEED_TARGET_SSL_ROOT_CERT: caPath,
    E2E_PASSWORD: strongOverride,
  };
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (/\/db(?:\.ts)?$/.test(specifier)) {
        // Preserve tsx's module format so the pack and test share one fixture instance.
        return nextResolve(new URL('./seed-agent-pack.fixture.ts', import.meta.url).href, context);
      }
      return nextResolve(specifier, context);
    },
  });
  t.mock.method(console, 'log', () => undefined);
  writes.length = 0;
  try {
    const { seedAgentPack } = await import('../src/seed-packs/agent-pack');
    const { E2E_PASSWORD } = await import('../src/e2e-users');
    const { assertSeedTargetAllowed, resetSeedTargetBindingForTests } =
      await import('../src/seed-target-guard');
    const { E2E_AGENT_PACK_USERS } = await import('../src/e2e-agent-pack-fixtures');
    const schema = await import('../src/schema');
    const config = createSeedConfig('e2e', new Date(0));
    assert.ok(E2E_PASSWORD === strongOverride, 'unexpected effective fixture value');

    await seedAgentPack(config);
    const accounts = writes.filter(write => write.table === schema.account).map(write => write.row);
    assert.deepEqual(
      accounts.map(row => row.userId),
      [E2E_AGENT_PACK_USERS.AGENT.id, ...E2E_AGENT_PACK_USERS.CLIENTS.map(client => client.id)]
    );
    for (const row of accounts) {
      assert.ok(typeof row.password === 'string');
      assert.ok(compareSync(E2E_PASSWORD, row.password));
    }

    // Repeated seed steps retain the verified clients installed by the guarded import.
    const remoteClient = clients.queryClientAdmin;
    await seedAgentPack(config);
    writes.length = 0;
    process.env.E2E_PASSWORD = strongOverride + '!';
    await assert.rejects(seedAgentPack(config), {
      message: 'Seed target refused: non-local-password',
    });
    assert.equal(writes.length, 0);

    // The driver would connect to the first host; the guard must refuse before any write.
    process.env = {
      ...testEnv,
      DATABASE_URL: 'postgres://fixture@remote.example.net,ignored@ci-postgres/db',
      SEED_TARGET_CONFIRM: 'plan070:ci-postgres',
    };
    await assert.rejects(seedAgentPack(config), { message: 'Seed target refused: ambiguous' });
    assert.equal(writes.length, 0);
    process.env = {
      ...testEnv,
      DATABASE_URL: 'postgres:///db',
      PGUSER: 'fixture',
      PGHOST: 'ci%2dpostgres',
      SEED_TARGET_CONFIRM: 'plan070:ci-postgres',
    };
    await assert.rejects(seedAgentPack(config), { message: 'Seed target refused: ambiguous' });
    assert.equal(writes.length, 0);
    process.env = { ...testEnv, DATABASE_URL: 'postgres://fixture@localhost/db' };
    await assert.rejects(seedAgentPack(config), { message: 'Seed target refused: target-changed' });
    assert.equal(writes.length, 0);
    resetSeedTargetBindingForTests();
    await assert.rejects(seedAgentPack(config), { message: 'Seed target refused: unbound-client' });
    assert.equal(writes.length, 0);
    // Preflight A, cache clients while configured for B, then restore A before seeding.
    delete clients.queryClientAdmin;
    delete clients.queryClientRls;
    assertSeedTargetAllowed(process.env);
    const localEnv = process.env;
    process.env = { ...testEnv, DATABASE_URL: `postgres://fixture@db.${staging}.supabase.co/db` };
    clients.queryClientAdmin = remoteClient;
    clients.queryClientRls = remoteClient;
    process.env = localEnv;
    await assert.rejects(seedAgentPack(config), {
      message: 'Seed target refused: client-mismatch',
    });
    assert.equal(writes.length, 0);
    clients.queryClientAdmin = fixtureDb;
    await assert.rejects(seedAgentPack(config), {
      message: 'Seed target refused: client-mismatch',
    });
    assert.equal(writes.length, 0);
  } finally {
    const { closeSeedTargetClients } = await import('../src/seed-target-guard');
    await closeSeedTargetClients();
    rmSync(directory, { recursive: true, force: true });
    if (previousAdmin) Object.defineProperty(clients, 'queryClientAdmin', previousAdmin);
    else delete clients.queryClientAdmin;
    if (previousRls) Object.defineProperty(clients, 'queryClientRls', previousRls);
    else delete clients.queryClientRls;
    process.env = previousEnv;
    hooks.deregister();
  }
});
