import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { inspect } from 'node:util';
import { withPreflightedAdminConnection } from '../src/admin-connection-preflight';
import { type AdminFixture, startAdminFixture } from './admin-connection-preflight.support';
const SOURCE = readFileSync(
  new URL('../src/admin-connection-preflight.ts', import.meta.url),
  'utf8'
);
let fixture: AdminFixture;
before(async () => {
  fixture = await startAdminFixture();
});
after(async () => {
  const receipt = await fixture.stop();
  assert(receipt.removedAt);
  assert(!JSON.stringify(receipt).includes('password'));
});
function failureCode(result: Awaited<ReturnType<typeof withPreflightedAdminConnection>>) {
  if (result.ok) assert.fail('expected preflight rejection');
  return result.error.code;
}
const run = (
  env: Readonly<Record<string, unknown>>,
  signal: AbortSignal,
  authority: AdminFixture['authority'],
  operation: Parameters<typeof withPreflightedAdminConnection>[4]
) => withPreflightedAdminConnection(env, Date.now(), signal, authority, operation);
test('keeps the wrapper internal, fixed-query-only, and free of forbidden capabilities', () => {
  assert.equal((SOURCE.match(/postgres\(options\)/g) ?? []).length, 1);
  assert.equal((SOURCE.match(/probe\(reserved, options, authority\)/g) ?? []).length, 2);
  assert.match(SOURCE, /sql\.reserve\(\)/);
  assert.match(SOURCE, /reserved\?\.release\(\)/);
  assert.match(SOURCE, /sql\?\.end\(\{ timeout: 1 \}\)/);
  assert.doesNotMatch(
    SOURCE,
    /\.unsafe\(|\b(?:drizzle|migration)\b|node:(?:fs|path)|console\.|process\.(?:stdout|stderr)/i
  );
  const imports = execFileSync(
    'rg',
    ['-l', 'from [\'"][^\'"]*admin-connection-preflight[\'"]', 'packages'],
    { encoding: 'utf8', cwd: '../..' }
  )
    .trim()
    .split('\n');
  assert.deepEqual(imports.sort(), [
    'packages/database/test/admin-connection-preflight.support.ts',
    'packages/database/test/admin-connection-preflight.test.ts',
  ]);
});
test('accepts the disposable owner once on one reserved plaintext PostgreSQL 16 session', async () => {
  let pid = 0;
  let calls = 0;
  const result = await run(
    fixture.ownerEnv,
    new AbortController().signal,
    fixture.authority,
    async sql => {
      calls += 1;
      const rows = await sql`SELECT pg_backend_pid()::int AS pid`;
      pid = rows[0]?.pid ?? 0;
    }
  );
  assert.equal(calls, 1);
  assert.deepEqual(result, {
    ok: true,
    summary: {
      contract_version: 'admin_connection_preflight_v1',
      endpoint_class: 'local_scratch',
      session_reserved: true,
      identity_verified: true,
      database_owner_verified: true,
      writable_primary_verified: true,
      transport_verified: 'loopback_plaintext',
      server_major: 16,
      operation_completed: true,
    },
  });
  await fixture.waitForNoSession(pid);
});
test('rejects an unbound endpoint before connect and a connected nonowner before operation', async () => {
  let calls = 0;
  const wrongAuthority = { ...fixture.authority, endpointSha256: '0'.repeat(64) };
  const authorityResult = await run(
    fixture.ownerEnv,
    new AbortController().signal,
    wrongAuthority,
    async () => {
      calls += 1;
    }
  );
  assert.equal(failureCode(authorityResult), 'ADMIN_DB_PREFLIGHT_AUTHORITY_REJECTED');
  await fixture.waitForNoSession();
  const ownerResult = await run(
    fixture.nonownerEnv,
    new AbortController().signal,
    fixture.authority,
    async () => {
      calls += 1;
    }
  );
  assert.equal(failureCode(ownerResult), 'ADMIN_DB_PREFLIGHT_ROLE_REJECTED');
  assert.equal(calls, 0);
  await fixture.waitForNoSession();
});
test('linearizes pre-abort and abort during a signal-aware read-only operation', async () => {
  const preAborted = new AbortController();
  preAborted.abort();
  let calls = 0;
  const early = await run(fixture.ownerEnv, preAborted.signal, fixture.authority, async () => {
    calls += 1;
  });
  assert.equal(failureCode(early), 'ADMIN_DB_PREFLIGHT_ABORTED');
  const controller = new AbortController();
  let pid = 0;
  const during = await run(
    fixture.ownerEnv,
    controller.signal,
    fixture.authority,
    async (sql, signal) => {
      calls += 1;
      if (signal.aborted) return;
      pid = (await sql`SELECT pg_backend_pid()::int AS pid`)[0]?.pid ?? 0;
      // prettier-ignore
      { const pending = sql`SELECT pg_sleep(5)`; const cancel = () => { void pending.cancel(); }; signal.addEventListener('abort', cancel, { once: true }); setTimeout(() => controller.abort(), 25); try { await pending; } finally { signal.removeEventListener('abort', cancel); } }
    }
  );
  assert.equal(calls, 1);
  assert.equal(failureCode(during), 'ADMIN_DB_PREFLIGHT_ABORTED');
  await fixture.waitForNoSession(pid);
});
test('redacts operation failures and tears the reserved session down', async () => {
  const sentinel = 'UNIQUE_OPERATION_FAILURE_DO_NOT_DISCLOSE';
  let pid = 0;
  const result = await run(
    fixture.ownerEnv,
    new AbortController().signal,
    fixture.authority,
    async sql => {
      pid = (await sql`SELECT pg_backend_pid()::int AS pid`)[0]?.pid ?? 0;
      throw new Error(sentinel);
    }
  );
  assert.equal(failureCode(result), 'ADMIN_DB_PREFLIGHT_OPERATION_FAILED');
  assert(!JSON.stringify(result).includes(sentinel));
  assert(!inspect(result).includes(sentinel));
  await fixture.waitForNoSession(pid);
});
