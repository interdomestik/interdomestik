import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { namedProofLoader } from './db-access-named-proof-loader.mjs';

async function child(mode) {
  const provider = await import('./packages/database/src/db.js');
  const schema = await import('./packages/database/src/schema/auth.js');
  const loader = namedProofLoader({
    provider,
    environment: { NEXT_RUNTIME: 'nodejs', INTERDOMESTIK_BUILT_CSP_NONCE_MODE: 'off' },
    ports: {
      '@interdomestik/database/schema/auth': schema,
      'drizzle-orm/postgres-js/migrator': {
        migrate(database, options) {
          assert.equal(database, provider.dbAdmin);
          assert.notEqual(database, provider.dbRls);
          assert.equal(options.migrationsFolder, './drizzle');
          return migrate(database, options);
        },
      },
    },
  });
  const { performHealthCheck } = await loader.import(
    'apps/web/src/features/health/health.service.ts'
  );
  if (mode === 'unsafe') {
    assert.equal((await performHealthCheck()).services.database.status, 'unhealthy');
    const { register } = await loader.import('apps/web/src/instrumentation.ts');
    await assert.rejects(register, /role|RLS/i);
    assert.equal(loader.events.filter(event => event[0] === 'handler').length, 0);
    return;
  }
  await provider.assertRlsConnectionRoleReady();
  const [identity] = await provider.dbRls.execute(
    sql`select session_user::text as login, current_user::text as effective`
  );
  assert.equal(identity.login, process.env.NAMED_PROOF_LOGIN);
  assert.equal(identity.effective, identity.login);
  assert.equal(
    (await performHealthCheck()).services.database.status,
    'unhealthy',
    'missing relation must fail real liveness'
  );
  await loader.import('packages/database/src/migrate.ts');
  for (
    let attempt = 0;
    !loader.events.some(event => event[0] === 'exit') && attempt < 100;
    attempt++
  )
    await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(
    loader.events.find(event => event[0] === 'exit')?.[1],
    mode === 'migration-failure' ? 1 : 0
  );
  if (mode === 'migration-failure') {
    assert.equal((await performHealthCheck()).services.database.status, 'unhealthy');
    const [row] = await provider.dbAdmin.execute(
      sql`select to_regclass('public.user')::text as relation`
    );
    assert.equal(row.relation, null);
  } else {
    assert.equal((await performHealthCheck()).services.database.status, 'healthy');
    const rows = await provider.dbRls.execute(sql`select id from public."user"`);
    assert.equal(rows.length, 0, 'liveness must not expose either tenant without context');
    await assert.rejects(() =>
      provider.dbRls.execute(sql`create table public.forbidden (id text)`)
    );
    const { register } = await loader.import('apps/web/src/instrumentation.ts');
    await register();
    assert.equal(loader.events.filter(event => event[0] === 'handler').length, 2);
  }
}

export async function runNamedLiveProof() {
  const address = new URL(process.env.DATABASE_URL);
  assert.equal(address.hostname, '127.0.0.1');
  assert.equal(address.pathname, '/interdomestik_test');
  const admin = postgres(address.toString(), { max: 1, ssl: false, onnotice() {} });
  const token = randomBytes(8).toString('hex');
  const login = 's8_named_login_' + token,
    target = 's8_named_target_' + token;
  const password = randomBytes(24).toString('hex');
  const directory = fs.mkdtempSync(path.join(process.env.TMPDIR, 'named-live-'));
  let owned = false;
  try {
    const [prior] =
      await admin`select to_regclass('public.user')::text as relation, (select oid from pg_namespace where nspname='drizzle') as migrations`;
    assert.equal(prior.relation, null);
    assert.equal(prior.migrations, null);
    await admin.unsafe(
      `create role "${login}" login nosuperuser nobypassrls nocreaterole nocreatedb noinherit password '${password}'`
    );
    owned = true;
    await admin.unsafe(
      `create role "${target}" nologin nosuperuser nobypassrls nocreaterole nocreatedb noinherit`
    );
    await admin.unsafe(`grant "${target}" to "${login}"`);
    const rls = new URL(address);
    rls.username = login;
    rls.password = password;
    fs.mkdirSync(path.join(directory, 'drizzle/meta'), { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'drizzle/meta/_journal.json'),
      JSON.stringify({
        version: '7',
        dialect: 'postgresql',
        entries: [{ idx: 0, version: '7', when: 1, tag: '0000_named', breakpoints: false }],
      })
    );
    function run(mode, content) {
      fs.writeFileSync(path.join(directory, 'drizzle/0000_named.sql'), content);
      const result = spawnSync(
        process.execPath,
        ['--experimental-vm-modules', fileURLToPath(import.meta.url), 'child', mode],
        {
          cwd: directory,
          encoding: 'utf8',
          timeout: 30_000,
          maxBuffer: 2 * 1024 * 1024,
          env: {
            PATH: '/usr/bin:/bin',
            HOME: process.env.HOME,
            TMPDIR: process.env.TMPDIR,
            NODE_ENV: 'production',
            DATABASE_URL: address.toString(),
            DATABASE_URL_RLS: rls.toString(),
            DB_RLS_ROLE: target,
            DB_MAX_CONNECTIONS: '1',
            NAMED_PROOF_LOGIN: login,
          },
        }
      );
      const output = (result.stdout + result.stderr)
        .split(password)
        .join('[REDACTED]')
        .split(address.password)
        .join('[REDACTED]');
      assert.equal(result.status, 0, output);
      assert.match(result.stdout, /NAMED_LIVE_PROOF_PASS/);
    }
    await admin.unsafe(`alter role "${login}" bypassrls`);
    run('unsafe', 'select 1;');
    await admin.unsafe(`alter role "${login}" nobypassrls`);
    run('migration-failure', 'create table public."user" (id text); select 1/0;');
    await admin.unsafe('drop schema if exists drizzle cascade');
    run(
      'positive',
      `create table public."user" (id text, tenant_id text);\ninsert into public."user" values ('a','tenant_a'),('b','tenant_b');\nalter table public."user" enable row level security; alter table public."user" force row level security;\ncreate policy named_tenant on public."user" using (tenant_id=current_setting('app.current_tenant_id',true));\ngrant select on public."user" to "${login}";`
    );
  } finally {
    if (owned) {
      await admin.unsafe('drop table if exists public."user"');
      await admin.unsafe('drop schema if exists drizzle cascade');
      await admin.unsafe(`drop role if exists "${login}"`);
      await admin.unsafe(`drop role if exists "${target}"`);
    }
    await admin.end({ timeout: 2 });
    fs.rmSync(directory, { recursive: true });
  }
}
if (process.argv[2] === 'child') {
  try {
    await child(process.argv[3]);
    console.log('NAMED_LIVE_PROOF_PASS');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
