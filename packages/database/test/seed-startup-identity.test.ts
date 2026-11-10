import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import postgres from 'postgres';
import { assertSeedTargetAllowed, resetSeedTargetBindingForTests } from '../src/seed-target-guard';

const approved = 'postgres://fixture@localhost:5432/approved_db';
const clients = globalThis as typeof globalThis & {
  queryClientAdmin?: postgres.Sql;
  queryClientRls?: postgres.Sql;
};
const opened: postgres.Sql[] = [];
let previousEnv: NodeJS.ProcessEnv;
beforeEach(() => {
  resetSeedTargetBindingForTests();
  previousEnv = process.env;
  process.env = { NODE_ENV: 'test', NODE_TEST_CONTEXT: previousEnv.NODE_TEST_CONTEXT };
});
afterEach(async () => {
  delete clients.queryClientAdmin;
  delete clients.queryClientRls;
  process.env = previousEnv;
  await Promise.all(opened.map(client => client.end()));
  opened.length = 0;
});

function lazyClient(value: string): postgres.Sql {
  const options = {
    max: 1,
    socket: () => {
      throw new Error('Unexpected connection');
    },
  };
  const client = postgres(value, options);
  opened.push(client);
  return client;
}

const overrides = [
  'database=unapproved_db&user=other_role',
  'user=other_role',
  'options=-crole%3Dother_role',
  'role=other_role',
  'search_path=other_schema',
  'client_encoding=SQL_ASCII',
  'application_name=probe%00database%00other_db',
  'application_name=probe%00user%00other_role',
];
for (const key of ['queryClientAdmin', 'queryClientRls'] as const) {
  for (const [index, override] of overrides.entries()) {
    test(`${key} rejects real driver startup override ${index + 1} after A-B-A drift`, () => {
      process.env.DATABASE_URL = approved;
      process.env.DATABASE_URL_RLS = approved;
      assertSeedTargetAllowed(process.env);
      const clientA = lazyClient(approved);
      process.env.DATABASE_URL = `${approved}?${override}`;
      const clientB = lazyClient(process.env.DATABASE_URL);
      // The old comparison cannot distinguish these clients' top-level identity fields.
      assert.equal(clientA.options.user, clientB.options.user);
      assert.equal(clientA.options.database, clientB.options.database);
      clients.queryClientAdmin = clientA;
      clients.queryClientRls = clientA;
      clients[key] = clientB;
      process.env.DATABASE_URL = approved;
      assert.throws(() => assertSeedTargetAllowed(process.env), {
        message: 'Seed target refused: client-mismatch',
      });
    });
  }
}

test('real clients with the approved startup identity and application name pass', () => {
  process.env.DATABASE_URL = approved;
  assertSeedTargetAllowed(process.env);
  clients.queryClientAdmin = lazyClient(`${approved}?user=fixture&database=approved_db`);
  clients.queryClientRls = lazyClient(approved);
  assert.equal(assertSeedTargetAllowed(process.env), 'local');
});

test('query user uses the last override without changing the driver database fallback', () => {
  process.env.DATABASE_URL = 'postgres://fixture@localhost:5432/?user=fixture&user=FIXTURE';
  assertSeedTargetAllowed(process.env);
  clients.queryClientAdmin = lazyClient(process.env.DATABASE_URL);
  clients.queryClientRls = clients.queryClientAdmin;
  assert.equal(clients.queryClientAdmin.options.database, 'fixture');
  assert.equal(assertSeedTargetAllowed(process.env), 'local');
});
