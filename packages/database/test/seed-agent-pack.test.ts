import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { compareSync } from 'bcryptjs';
import { createSeedConfig } from '../src/seed-types';
import { writes } from './seed-agent-pack.fixture';

test('agent credentials use cached E2E password and reject later environment drift', async t => {
  const strongOverride = ['x'.repeat(18), 'A', '1'].join('');
  const staging = 's'.repeat(20);
  const previousEnv = process.env;
  process.env = {
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

    writes.length = 0;
    process.env.E2E_PASSWORD = strongOverride + '!';
    await assert.rejects(seedAgentPack(config), {
      message: 'Seed target refused: non-local-password',
    });
    assert.equal(writes.length, 0);
  } finally {
    process.env = previousEnv;
    hooks.deregister();
  }
});
