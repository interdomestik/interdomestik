import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const dbFile = new URL('../src/db.ts', import.meta.url);
const requireDb = createRequire(dbFile);
const compiled = ts.transpileModule(readFileSync(dbFile, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
const session = 'postgres://admin:pass@pooler.example:5432/app';
const transaction = 'postgres://runtime:pass@pooler.example:6543/app';

function clients(env: Record<string, string>, cached: Record<string, unknown> = {}) {
  const calls: { url: string; options: Record<string, unknown> }[] = [];
  const postgres = (url: string, options: Record<string, unknown>) => {
    calls.push({ url, options });
    return async () => [
      {
        currentUser: 'runtime',
        roleName: 'runtime',
        roleBypassesRls: false,
        roleIsSuperuser: false,
      },
    ];
  };
  runInNewContext(compiled, {
    exports: {},
    global: cached,
    process: { env: { NODE_ENV: 'test', ...env } },
    console,
    require: (name: string) => {
      if (name === 'postgres') return postgres;
      if (name === 'drizzle-orm/postgres-js') return { drizzle: (client: unknown) => client };
      return requireDb(name);
    },
  });
  return calls;
}

test('each runtime client detects its own pooler port', () => {
  for (const [admin, rls] of [
    [session, transaction],
    [transaction, session],
  ]) {
    const calls = clients({ DATABASE_URL: admin, DATABASE_URL_RLS: rls });
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

test('explicit environment override disables preparation for both runtime clients', () => {
  const calls = clients({
    DATABASE_URL: session,
    DATABASE_URL_RLS: `${session}?rls`,
    DB_TRANSACTION_POOLER: '1',
  });
  assert.equal(calls.length, 2);
  assert(calls.every(({ options }) => options.prepare === false));
});

test('local, missing-port and session URLs keep postgres preparation defaults', () => {
  for (const url of [
    session,
    'postgres://postgres:postgres@localhost:54322/postgres',
    'postgres://admin:pass@pooler.example/app',
  ]) {
    const calls = clients({ DATABASE_URL: url, DB_TRANSACTION_POOLER: '0' });
    assert.equal(calls.length, 1, 'equal admin/RLS URLs reuse one client');
    assert.equal(Object.hasOwn(calls[0].options, 'prepare'), false);
  }
});

test('pooler mode preserves production options and existing global client reuse', () => {
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
  for (const { options } of clients(env)) {
    assert.equal(options.max, 1);
    assert.equal(options.ssl, 'require');
    assert.equal(options.idle_timeout, 13);
    assert.equal(options.connect_timeout, 17);
    assert.equal(options.max_lifetime, 1900);
  }
  const cachedClient = async () => [
    { currentUser: 'runtime', roleName: 'runtime', roleBypassesRls: false, roleIsSuperuser: false },
  ];
  assert.equal(
    clients(env, { queryClientAdmin: cachedClient, queryClientRls: cachedClient }).length,
    0
  );
});
