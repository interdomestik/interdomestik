import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertE2eRuntimeTarget,
  describeRuntimeRoleFailure,
  E2E_RUNTIME_ROLE,
  provisionE2eRuntimeRole,
  resolveE2eRuntimeUrl,
} from '../e2e-runtime-role.mjs';

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
  for (const host of ['localhost', '[::1]']) {
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
