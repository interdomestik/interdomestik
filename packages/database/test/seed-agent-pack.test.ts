import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { compareSync } from 'bcryptjs';
import { createSeedConfig } from '../src/seed-types';
import { db as fixtureDb, writes } from './seed-agent-pack.fixture';

test('agent credentials use cached E2E password and reject later environment drift', async t => {
  const strongOverride = ['x'.repeat(18), 'A', '1'].join('');
  const staging = 's'.repeat(20);
  const previousEnv = process.env;
  const clients = globalThis as typeof globalThis & {
    queryClientAdmin?: unknown;
    queryClientRls?: unknown;
  };
  const previousAdmin = Object.getOwnPropertyDescriptor(clients, 'queryClientAdmin');
  const previousRls = Object.getOwnPropertyDescriptor(clients, 'queryClientRls');
  process.env = {
    NODE_ENV: 'test',
    DATABASE_URL: `postgres://fixture@db.${staging}.supabase.co/db`,
    SEED_TARGET_CONFIRM: `plan070:${staging}`,
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
    const { resetSeedTargetBindingForTests } = await import('../src/seed-target-guard');
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

    // Model the global clients cached after the successful remote preflight.
    clients.queryClientAdmin = fixtureDb;
    clients.queryClientRls = fixtureDb;
    writes.length = 0;
    process.env.E2E_PASSWORD = strongOverride + '!';
    await assert.rejects(seedAgentPack(config), {
      message: 'Seed target refused: non-local-password',
    });
    assert.equal(writes.length, 0);

    // The driver would connect to the first host; the guard must refuse before any write.
    process.env = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://fixture@remote.example.net,ignored@ci-postgres/db',
      SEED_TARGET_CONFIRM: 'plan070:ci-postgres',
    };
    await assert.rejects(seedAgentPack(config), { message: 'Seed target refused: ambiguous' });
    assert.equal(writes.length, 0);
    process.env = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres:///db',
      PGUSER: 'fixture',
      PGHOST: 'ci%2dpostgres',
      SEED_TARGET_CONFIRM: 'plan070:ci-postgres',
    };
    await assert.rejects(seedAgentPack(config), { message: 'Seed target refused: ambiguous' });
    assert.equal(writes.length, 0);
    process.env = { NODE_ENV: 'test', DATABASE_URL: 'postgres://fixture@localhost/db' };
    await assert.rejects(seedAgentPack(config), { message: 'Seed target refused: target-changed' });
    assert.equal(writes.length, 0);
    resetSeedTargetBindingForTests();
    await assert.rejects(seedAgentPack(config), { message: 'Seed target refused: unbound-client' });
    assert.equal(writes.length, 0);
  } finally {
    if (previousAdmin) Object.defineProperty(clients, 'queryClientAdmin', previousAdmin);
    else delete clients.queryClientAdmin;
    if (previousRls) Object.defineProperty(clients, 'queryClientRls', previousRls);
    else delete clients.queryClientRls;
    process.env = previousEnv;
    hooks.deregister();
  }
});
