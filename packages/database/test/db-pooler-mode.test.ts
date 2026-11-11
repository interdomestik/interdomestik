import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import test from 'node:test';

const requireDb = createRequire(import.meta.url);
const dbPath = requireDb.resolve('../src/db.ts');
const session = 'postgres://admin:pass@pooler.example:5432/app';
const transaction = 'postgres://runtime:pass@pooler.example:6543/app';

async function clients(env: Record<string, string>, cached: Record<string, unknown> = {}) {
  const originalEnv = process.env;
  const originalCache = { ...requireDb.cache };
  const globals = globalThis as unknown as Record<string, unknown>;
  const clientKeys = ['queryClientAdmin', 'queryClientRls'];
  const originalGlobals = clientKeys.map(key => Object.getOwnPropertyDescriptor(globals, key));
  const calls: { url: string; options: Record<string, unknown> }[] = [];
  const postgres = (url: string, options: Record<string, unknown>) => {
    calls.push({ url, options });
    return () =>
      Promise.resolve([
        {
          currentUser: 'runtime',
          roleName: 'runtime',
          roleBypassesRls: false,
          roleIsSuperuser: false,
        },
      ]);
  };
  try {
    process.env = { NODE_ENV: 'test', ...env };
    for (const key of clientKeys) delete globals[key];
    Object.assign(globals, cached);
    for (const [name, exports] of [
      ['postgres', postgres],
      ['drizzle-orm/postgres-js', { drizzle: (client: unknown) => client }],
    ] as const) {
      const path = requireDb.resolve(name);
      const stub = new Module(path);
      stub.exports = exports;
      stub.loaded = true;
      requireDb.cache[path] = stub;
    }
    delete requireDb.cache[dbPath];
    const db = requireDb(dbPath) as typeof import('../src/db');
    await db.assertRlsConnectionRoleReady();
    return calls;
  } finally {
    process.env = originalEnv;
    clientKeys.forEach((key, index) => {
      const descriptor = originalGlobals[index];
      if (descriptor) Object.defineProperty(globals, key, descriptor);
      else delete globals[key];
    });
    for (const path of Object.keys(requireDb.cache)) {
      if (!Object.hasOwn(originalCache, path)) delete requireDb.cache[path];
    }
    Object.assign(requireDb.cache, originalCache);
  }
}

test('each runtime client detects its own pooler port', async () => {
  for (const [admin, rls] of [
    [session, transaction],
    [transaction, session],
  ]) {
    const calls = await clients({ DATABASE_URL: admin, DATABASE_URL_RLS: rls });
    assert.deepEqual(
      calls.map(call => call.url),
      [admin, rls]
    );
    for (const { url, options } of calls) {
      assert.equal(Object.hasOwn(options, 'prepare'), url === transaction);
      assert.equal(options.prepare, url === transaction ? false : undefined);
      assert.equal(options.max, 10);
      assert.equal(options.ssl, false);
      assert.equal(options.idle_timeout, 20);
      assert.equal(options.connect_timeout, 10);
      assert.equal(options.max_lifetime, 1800);
      assert.equal(typeof options.onnotice, 'function');
      assert.equal(Object.keys(options).length, url === transaction ? 7 : 6);
    }
  }
});

test('explicit environment override disables preparation for both runtime clients', async () => {
  const calls = await clients({
    DATABASE_URL: session,
    DATABASE_URL_RLS: `${session}?rls`,
    DB_TRANSACTION_POOLER: '1',
  });
  assert.equal(calls.length, 2);
  assert(calls.every(({ options }) => options.prepare === false));
});

test('local, missing-port and session URLs keep postgres preparation defaults', async () => {
  for (const url of [
    session,
    'postgres://postgres:postgres@localhost:54322/postgres',
    'postgres://admin:pass@pooler.example/app',
  ]) {
    const calls = await clients({ DATABASE_URL: url, DB_TRANSACTION_POOLER: '0' });
    assert.equal(calls.length, 1, 'equal admin/RLS URLs reuse one client');
    assert.equal(Object.hasOwn(calls[0].options, 'prepare'), false);
  }
});

test('pooler mode preserves production options and existing global client reuse', async () => {
  const env = {
    NODE_ENV: 'production',
    VERCEL: '1',
    DATABASE_URL: session,
    DATABASE_URL_RLS: transaction,
    DB_MAX_CONNECTIONS: '9',
    DB_IDLE_TIMEOUT: '13',
    DB_CONNECT_TIMEOUT: '17',
    DB_MAX_LIFETIME: '1900',
  };
  for (const { options } of await clients(env)) {
    assert.equal(options.max, 1);
    assert.equal(options.ssl, 'require');
    assert.equal(options.idle_timeout, 13);
    assert.equal(options.connect_timeout, 17);
    assert.equal(options.max_lifetime, 1900);
  }
  const cachedClient = () =>
    Promise.resolve([
      {
        currentUser: 'runtime',
        roleName: 'runtime',
        roleBypassesRls: false,
        roleIsSuperuser: false,
      },
    ]);
  assert.equal(
    (await clients(env, { queryClientAdmin: cachedClient, queryClientRls: cachedClient })).length,
    0
  );
});
