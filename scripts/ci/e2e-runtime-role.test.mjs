import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { grantE2eRuntimePrivileges } from '../e2e-runtime-role-grants.mjs';

test('E2E provisioning gives Finance windows read-only access and check events append-only access', async () => {
  const statements = [];
  const catalog = () =>
    Promise.resolve([
      { name: 'exchange_rate_check_windows', kind: 'r' },
      { name: 'exchange_rate_check_events', kind: 'r' },
      { name: 'unrestricted_fixture_table', kind: 'r' },
    ]);
  catalog.unsafe = statement => Promise.resolve(statements.push(statement));
  const role = '"interdomestik_runtime_rls"';
  await grantE2eRuntimePrivileges(catalog, role);
  const compareCodeUnits = (left, right) => Number(left > right) - Number(left < right);
  assert.deepEqual(
    statements.toSorted(compareCodeUnits),
    [
      `GRANT SELECT ON TABLE public.exchange_rate_check_windows TO ${role}`,
      `GRANT SELECT, INSERT ON TABLE public.exchange_rate_check_events TO ${role}`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.unrestricted_fixture_table TO ${role}`,
      `REVOKE ALL ON TABLE public.exchange_rate_check_events FROM ${role}`,
      `REVOKE ALL ON TABLE public.exchange_rate_check_windows FROM ${role}`,
    ].toSorted(compareCodeUnits)
  );
});

// No client is permitted in this database-free suite: the guarded factory's loader is stubbed.
const driverStub =
  'data:text/javascript,' +
  encodeURIComponent(
    'export let connections = 0; export function require() { connections++; throw Error("Unexpected connect"); }'
  );
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === 'tsx/cjs/api' ? driverStub : specifier, context);
  },
});
const {
  RuntimeRoleError,
  assertE2eRuntimeTarget,
  describeRuntimeRoleFailure,
  E2E_RUNTIME_ROLE,
  NARROWED_TABLE_GRANTS,
  provisionE2eRuntimeRole,
  resolveE2eRuntimeUrl,
} = await import('../e2e-runtime-role.mjs');
// The loader is imported on first use, so the stub stays registered for the whole suite.
const driver = await import(driverStub);

const ADMIN = 'postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test';
const PW = 'f0'.repeat(16);

test('derives one stable restricted credential per admin credential and cluster', () => {
  const first = new URL(resolveE2eRuntimeUrl(ADMIN));
  assert.equal(first.username, E2E_RUNTIME_ROLE);
  assert.equal(first.host, '127.0.0.1:5432');
  assert.equal(first.pathname, '/interdomestik_test');
  assert.match(first.password, /^[0-9a-f]{64}$/u);
  assert.notEqual(first.password, 'postgres');
  // Gate, smoke and parallel lanes must agree, or re-provisioning would rotate a live password.
  assert.equal(resolveE2eRuntimeUrl(ADMIN), first.toString());
  // The role is cluster-wide, so lanes on other databases of one cluster share the password.
  const otherDb = new URL(resolveE2eRuntimeUrl(ADMIN.replace('interdomestik_test', 'other_db')));
  const otherCluster = new URL(resolveE2eRuntimeUrl(ADMIN.replace(':5432/', ':54322/')));
  const otherAdmin = new URL(resolveE2eRuntimeUrl(ADMIN.replace(':postgres@', ':rotated@')));
  // Every loopback spelling names the same cluster (e2e-gate.sh uses localhost, lanes 127.0.0.1).
  for (const host of ['localhost', 'LOCALHOST']) {
    const spelled = new URL(resolveE2eRuntimeUrl(ADMIN.replace('127.0.0.1', host)));
    assert.equal(spelled.password, first.password, host);
  }
  assert.equal(otherDb.password, first.password);
  assert.equal(otherDb.pathname, '/other_db');
  assert.notEqual(otherCluster.password, first.password);
  assert.notEqual(otherAdmin.password, first.password);
});

test('rejects a non-loopback or option-carrying admin target before any preparation', () => {
  assert.doesNotThrow(() => assertE2eRuntimeTarget(ADMIN));
  assert.throws(() => assertE2eRuntimeTarget('postgresql://p:x@db.example.com/x'), /loopback/u);
  assert.throws(() => assertE2eRuntimeTarget(`${ADMIN}?options=-crole%3Dpostgres`), /options/u);
  assert.throws(() => assertE2eRuntimeTarget('postgresql://p:x@127.0.0.1/a%20b'), /plain/u);
});

test('refuses to run when DB_RLS_ROLE would make tenant transactions switch roles', async () => {
  await assert.rejects(
    provisionE2eRuntimeRole({ adminUrl: ADMIN, env: { DB_RLS_ROLE: 'authenticated' } }),
    /DB_RLS_ROLE must be unset/u
  );
});

test('accepts a configured runtime URL for the same loopback database', () => {
  const runtime = `postgresql://${E2E_RUNTIME_ROLE}:${'a1'.repeat(12)}@127.0.0.1:5432/interdomestik_test`;
  assert.equal(resolveE2eRuntimeUrl(ADMIN, runtime), runtime);
});

test('compares databases on the port the driver uses, PGPORT included', () => {
  const portless = ADMIN.replace(':5432/', '/');
  const runtime = new URL(resolveE2eRuntimeUrl(ADMIN));
  const saved = process.env.PGPORT;
  process.env.PGPORT = '55432';
  try {
    // The driver sends the port-less admin URL to 55432; a runtime URL on 5432 is another cluster.
    assert.throws(
      () => resolveE2eRuntimeUrl(portless, runtime.toString()),
      /must target the admin URL database/u
    );
    // The derived credential is keyed on the port the driver will use.
    const derived = new URL(resolveE2eRuntimeUrl(portless)).password;
    const explicit = new URL(resolveE2eRuntimeUrl(ADMIN.replace(':5432/', ':55432/'))).password;
    assert.equal(derived, explicit);
  } finally {
    if (saved === undefined) delete process.env.PGPORT;
    else process.env.PGPORT = saved;
  }
});

test('refuses runtime URLs that could reach another role, database or host', () => {
  const cases = [
    [ADMIN, 'postgresql://postgres:x@127.0.0.1:5432/interdomestik_test', /must connect as/u],
    [ADMIN, `postgresql://${E2E_RUNTIME_ROLE}@127.0.0.1:5432/interdomestik_test`, /password/u],
    [
      ADMIN,
      `postgresql://${E2E_RUNTIME_ROLE}:short@127.0.0.1:5432/interdomestik_test`,
      /password/u,
    ],
    [
      ADMIN,
      `postgresql://${E2E_RUNTIME_ROLE}:${PW}@127.0.0.1:5432/postgres`,
      /admin URL database/u,
    ],
    [
      ADMIN,
      `postgresql://${E2E_RUNTIME_ROLE}:${PW}@127.0.0.1:54322/interdomestik_test`,
      /admin URL/u,
    ],
    [
      ADMIN,
      `postgresql://${E2E_RUNTIME_ROLE}:${PW}@db.example.com:5432/interdomestik_test`,
      /loopback/u,
    ],
    ['postgresql://postgres:x@db.example.com:5432/prod', undefined, /loopback/u],
    ['mysql://root@127.0.0.1/interdomestik_test', undefined, /must be postgres/u],
    ['not a url', undefined, /not a valid database URL/u],
  ];
  for (const [adminUrl, runtimeUrl, message] of cases) {
    assert.throws(() => resolveE2eRuntimeUrl(adminUrl, runtimeUrl), message);
  }
});

test('error messages never echo a configured password', () => {
  const runtime = 'postgresql://postgres:leak-me@127.0.0.1:5432/interdomestik_test';
  assert.throws(
    () => resolveE2eRuntimeUrl(ADMIN, runtime),
    error => !String(error.message).includes('leak-me')
  );
});

test('failure output keeps only authored messages and the SQLSTATE of driver errors', () => {
  const driverError = Object.assign(new Error('role "x" PASSWORD \'leak-me\''), {
    code: '42501',
    query: "ALTER ROLE x PASSWORD 'leak-me'",
    parameters: ['leak-me'],
  });
  assert.equal(describeRuntimeRoleFailure(driverError), 'database error 42501');
  assert.equal(describeRuntimeRoleFailure({ code: "'leak-me'" }), 'database error unknown');
  assert.throws(
    () => resolveE2eRuntimeUrl('postgresql://p:x@db.example.com/x'),
    error => {
      assert.match(describeRuntimeRoleFailure(error), /loopback/u);
      return true;
    }
  );
  assert.equal(describeRuntimeRoleFailure(new Error('raw leak-me')), 'database error unknown');
});

test('the CLI fails closed with a sanitized message before touching a database', () => {
  const cli = fileURLToPath(new URL('../e2e-runtime-role-cli.mjs', import.meta.url));
  const run = (env, ...args) =>
    spawnSync(process.execPath, [cli, ...args], { env: { PATH: process.env.PATH, ...env } });
  const missing = run({}, '--print-url');
  assert.equal(missing.status, 1);
  assert.match(String(missing.stderr), /failed: E2E_DATABASE_URL is required/u);
  assert.equal(String(missing.stdout), '');
  const remote = run(
    { E2E_DATABASE_URL: 'postgresql://p:secret@db.example.com/x' },
    '--check-target'
  );
  assert.equal(remote.status, 1);
  assert.match(String(remote.stderr), /loopback/u);
  assert.doesNotMatch(String(remote.stderr), /secret/u);
  assert.equal(run({ E2E_DATABASE_URL: ADMIN }, '--check-target').status, 0);
});

function isAuthorityRefusal(error) {
  assert.ok(error instanceof RuntimeRoleError);
  assert.match(error.message, /(?:database (?:authority|URL)|loopback host)/u);
  assert.ok(!error.message.includes(PW));
  assert.ok(!error.message.includes('postgres://'));
  return true;
}

async function assertAuthorityRefused(suffix) {
  const suspect = `postgres://${E2E_RUNTIME_ROLE}:${PW}@${suffix}`;
  assert.throws(() => assertE2eRuntimeTarget(suspect), isAuthorityRefusal);
  assert.throws(() => resolveE2eRuntimeUrl(suspect), isAuthorityRefusal);
  assert.throws(() => resolveE2eRuntimeUrl(ADMIN, suspect), isAuthorityRefusal);
  await assert.rejects(provisionE2eRuntimeRole({ adminUrl: suspect, env: {} }), isAuthorityRefusal);
  await assert.rejects(
    provisionE2eRuntimeRole({ adminUrl: ADMIN, runtimeUrl: suspect, env: {} }),
    isAuthorityRefusal
  );
}

test('ambiguous admin and runtime authorities refuse before any driver construction', async () => {
  await Promise.all(
    [
      'remote.example.net,ignored@localhost/interdomestik_test',
      'remote.example.net@localhost/interdomestik_test',
      'localhost,remote.example.net/interdomestik_test',
      '%6cocalhost/interdomestik_test',
      "localhost$'/interdomestik_test",
      'localhost/interdomestik_test#fragment',
      'localhost/interdomestik_test\\extra',
      'localhost/interdomestik_test\t',
      '[::1]/interdomestik_test',
    ].map(assertAuthorityRefused)
  );
  assert.equal(driver.connections, 0);
});

test('non-loopback admin and runtime targets refuse before any driver construction', async () => {
  await Promise.all(
    ['n', '[::1]', 'other-postgres', 'remote.example.net'].map(host =>
      assertAuthorityRefused(`${host}/interdomestik_test`)
    )
  );
  assert.equal(driver.connections, 0);
});

test('the narrowed E2E grants equal the WP-12 migration grants of the restricted runtime role', () => {
  const drizzle = new URL('../../packages/database/drizzle/', import.meta.url);
  const [file] = readdirSync(drizzle).filter(name =>
    name.endsWith('_wp12_claim_correspondence.sql')
  );
  assert.ok(file, 'the WP-12 migration exists');
  const sql = readFileSync(new URL(file, drizzle), 'utf8').replaceAll(/\s+/gu, ' ');
  const granted = {};
  for (const [, columns, table] of sql.matchAll(
    /GRANT UPDATE \(([^)]*)\) ON public\.(\w+) TO interdomestik_runtime_rls/gu
  )) {
    granted[table] = columns.split(',').map(column => column.trim());
  }
  const revoked = sql.match(
    /REVOKE UPDATE, DELETE, TRUNCATE ON (public\.\w+(?:, public\.\w+)*) FROM interdomestik_runtime_rls/u
  );
  assert.ok(revoked, 'the migration revokes table-wide writes from the runtime role');
  const tables = revoked[1].split(', ').map(name => name.replace('public.', ''));
  assert.deepEqual(new Set(Object.keys(NARROWED_TABLE_GRANTS)), new Set(tables));
  for (const table of tables) {
    assert.deepEqual(NARROWED_TABLE_GRANTS[table], granted[table] ?? [], table);
  }
});
