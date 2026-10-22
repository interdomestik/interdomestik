import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
const code = value => value?.code ?? value?.cause?.code;

export async function runRestrictedProviderFixture(probeUrl) {
  const url = process.env.DATABASE_URL;
  assert.ok(url, 'fixed producer requires its explicit owned database');
  const address = new URL(url);
  assert.equal(address.hostname, '127.0.0.1');
  assert.ok(['5432', '55438'].includes(address.port));
  assert.equal(address.pathname, '/interdomestik_test');
  assert.equal(address.search, '');
  assert.equal(address.hash, '');
  const admin = postgres(url, { max: 1, ssl: false, onnotice: () => undefined });
  const token = randomBytes(8).toString('hex'),
    schema = 's8_native_' + token;
  const names = ['login', 'target', 'bypass', 'super'].map(
    kind => 's8_native_' + kind + '_' + token
  );
  const password = randomBytes(24).toString('hex');
  const created = [];
  function run(mode, login = names[0], target = names[1]) {
    const rls = new URL(url);
    rls.username = login;
    rls.password = password;
    const result = spawnSync(process.execPath, [fileURLToPath(probeUrl), 'child', mode], {
      cwd: fileURLToPath(new URL('./', probeUrl)),
      shell: false,
      timeout: 30_000,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      env: {
        PATH: '/usr/bin:/bin',
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        TZ: 'UTC',
        LANG: 'C.UTF-8',
        NODE_ENV: 'production',
        DB_MAX_CONNECTIONS: '1',
        DATABASE_URL: url,
        DATABASE_URL_RLS: rls.toString(),
        DB_RLS_ROLE: target,
        PROVIDER_PROOF_SCHEMA: schema,
        PROVIDER_PROOF_EXPECTED_LOGIN: login,
        PROVIDER_PROOF_EXPECTED_REFUSAL: login === names[0] ? 'configuredDbRole' : 'connection',
      },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const line = result.stdout
      .split('\n')
      .find(value => value.startsWith('PINNED_PROVIDER_RESULT '));
    assert.ok(line, 'fixed producer child receipt required');
    return JSON.parse(line.slice('PINNED_PROVIDER_RESULT '.length));
  }
  try {
    const [server] = await admin.unsafe(
      "select current_setting('server_version_num')::int as version"
    );
    assert.ok(
      server.version >= 160000 && server.version < 170000,
      'fixed producer requires PostgreSQL 16'
    );
    for (const [index, name] of names.entries()) {
      await admin.unsafe(
        'create role "' +
          name +
          '" ' +
          (index === 1 ? 'nologin' : 'login') +
          ' ' +
          (index === 3 ? 'superuser' : 'nosuperuser') +
          ' ' +
          (index === 2 ? 'bypassrls' : 'nobypassrls') +
          " nocreaterole nocreatedb noinherit password '" +
          password +
          "'"
      );
      created.push(name);
    }
    const wrongAddress = new URL(url);
    wrongAddress.username = names[0];
    wrongAddress.password = password + '_wrong';
    const wrongPassword = postgres(wrongAddress.toString(), {
      max: 1,
      ssl: false,
      connect_timeout: 5,
    });
    try {
      await assert.rejects(
        () => wrongPassword.unsafe('select 1'),
        error => code(error) === '28P01'
      );
    } finally {
      await wrongPassword.end({ timeout: 1 });
    }
    await admin.unsafe('grant "' + names[1] + '" to "' + names[0] + '"');
    await admin.unsafe('create schema "' + schema + '"');
    for (const table of ['facts', 'writes']) {
      await admin.unsafe(
        'create table "' + schema + '"."' + table + '" (tenant_id text not null,value text)'
      );
      await admin.unsafe('alter table "' + schema + '"."' + table + '" enable row level security');
      await admin.unsafe('alter table "' + schema + '"."' + table + '" force row level security');
      await admin.unsafe(
        'create policy tenant_scope on "' +
          schema +
          '"."' +
          table +
          "\" using (tenant_id = current_setting('app.current_tenant_id',true)) with check " +
          "(tenant_id = current_setting('app.current_tenant_id',true))"
      );
      await admin.unsafe(
        'grant select,insert on "' + schema + '"."' + table + '" to "' + names[1] + '"'
      );
    }
    await admin.unsafe('grant usage on schema "' + schema + '" to "' + names[1] + '"');
    await admin.unsafe(
      'insert into "' + schema + "\".facts values ('tenant_a','a'),('tenant_b','b')"
    );
    const positive = run('positive');
    assert.equal(positive.callbacks, 1);
    assert.equal(positive.sameBackendRollback, true);
    assert.equal(positive.sameBackendCommit, true);
    assert.equal(positive.ownedPoolDistinct, true);
    assert.deepEqual(run('preloaded'), {
      preloadedRefused: true,
      foreignConnectionPreserved: true,
    });
    for (const login of names.slice(2))
      assert.deepEqual(run('unsafe', login), { unsafeRefused: true, callbacks: 0 });
    assert.deepEqual(run('unsafe', names[0], names[2]), { unsafeRefused: true, callbacks: 0 });
    console.info(
      'FIXED_PROVIDER_OBSERVATIONS ' +
        JSON.stringify({ ...positive, postgres16: true, wrongPasswordRefused: '28P01' })
    );
  } finally {
    await admin.unsafe('drop schema if exists "' + schema + '" cascade');
    for (const name of created.reverse()) {
      for (let attempt = 0; attempt < 50; attempt++) {
        const [row] = await admin.unsafe(
          'select count(*)::int as count from pg_catalog.pg_stat_activity where usename=$1',
          [name]
        );
        if (row.count === 0) break;
        await new Promise(resolve => setTimeout(resolve, 100));
        if (attempt === 49) assert.fail('owned proof role session was not retired');
      }
      await admin.unsafe('drop role "' + name + '"');
    }
    await admin.end({ timeout: 2 });
  }
}
