import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import test, { type TestContext } from 'node:test';
import postgres from 'postgres';
import { resetSeedTargetBindingForTests } from '../src/seed-target-guard';
import { createSeedConfig } from '../src/seed-types';
import { writes } from './seed-agent-pack.fixture';

const pilot = new URL('../../../scripts/pilot/day1_multi_seeder.ts', import.meta.url).href;
const clients = globalThis as typeof globalThis & {
  queryClientAdmin?: postgres.Sql;
  queryClientRls?: postgres.Sql;
};

async function runPilot(t: TestContext): Promise<void> {
  const errors = t.mock.method(console, 'error', () => undefined);
  const exit = t.mock.method(process, 'exit', (): never => {
    throw new Error('Intercepted exit');
  });
  await assert.rejects(import(pilot), /Intercepted exit/);
  assert.equal(exit.mock.calls[0]?.arguments[0], 1);
  assert.equal(errors.mock.calls[0]?.arguments[1]?.message, 'Seed target refused: client-mismatch');
}

async function assertFirstImportDrift(entry: 'agent' | 'pilot', t: TestContext): Promise<void> {
  resetSeedTargetBindingForTests();
  const previousEnv = process.env;
  process.env = {
    NODE_ENV: 'test',
    NODE_TEST_CONTEXT: previousEnv.NODE_TEST_CONTEXT,
    DATABASE_URL: 'postgres://fixture@localhost:5432/approved_db',
  };
  const opened: postgres.Sql[] = [];
  const socket = t.mock.fn((): never => {
    throw new Error('Unexpected connection');
  });
  const driverOptions = { max: 1, socket };
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === '@interdomestik/database' || /\/db(?:\.ts)?$/.test(specifier)) {
        const approved = process.env.DATABASE_URL;
        process.env.DATABASE_URL = `${approved}?database=unapproved_db&user=other_role`;
        const client = postgres(process.env.DATABASE_URL, driverOptions);
        opened.push(client);
        clients.queryClientAdmin = client;
        clients.queryClientRls = client;
        process.env.DATABASE_URL = approved;
        return nextResolve(new URL('./seed-agent-pack.fixture.ts', import.meta.url).href, context);
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      // The pilot is an ESM script with top-level await in a package without type: module.
      if (url === pilot) {
        return {
          format: 'module',
          shortCircuit: true,
          source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8')),
        };
      }
      return nextLoad(url, context);
    },
  });
  t.mock.method(console, 'log', () => undefined);
  writes.length = 0;
  try {
    if (entry === 'agent') {
      const { seedAgentPack } = await import('../src/seed-packs/agent-pack');
      await assert.rejects(seedAgentPack(createSeedConfig('e2e', new Date(0))), {
        message: 'Seed target refused: client-mismatch',
      });
    } else {
      await runPilot(t);
    }
    assert.equal(opened.length, 1);
    assert.equal(writes.length, 0);
    assert.equal(socket.mock.callCount(), 0);
  } finally {
    hooks.deregister();
    delete clients.queryClientAdmin;
    delete clients.queryClientRls;
    process.env = previousEnv;
    await Promise.all(opened.map(client => client.end()));
  }
}

test('agent pack first invocation refuses client drift during import before writes', t =>
  assertFirstImportDrift('agent', t));
test('pilot first invocation refuses client drift during import before writes', t =>
  assertFirstImportDrift('pilot', t));
