import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// scripts/pilot writers (U3-R3). A fresh process per case preserves first-import behavior and
// isolates cached clients; the probe runs from the repository root.
const probe = String.raw`
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TEST_CA_PEM } from './packages/database/test/seed-tls-ca.fixture.ts';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import postgres from 'postgres';

const [entry, mode] = process.argv.slice(1);
const dotenvPassword = mode === 'dotenv-password';
const refusedImportMode = mode.startsWith('rls:') || mode === 'production';
const target = mode === 'remote' || dotenvPassword
  ? 'postgres://u:p@remote.example.net/db'
  : 'postgres://fixture@localhost:5432/approved_db';
process.env = {
  NODE_ENV: mode === 'production' ? 'production' : 'test',
  NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT,
  DATABASE_URL: entry === 'day1_run3_lifecycle' ? target
    : 'postgres://fixture@localhost:5432/approved_db',
  ...(mode.startsWith('rls:') ? { REQUIRE_RLS_INTEGRATION: mode.slice(4) } : {}),
};
const directory = mkdtempSync(join(tmpdir(), 'pilot-tls-'));
const caPath = join(directory, 'ca.pem');
writeFileSync(caPath, TEST_CA_PEM);
const dotenvEnv = {
  DATABASE_URL: target,
  ...(dotenvPassword ? {
    SEED_TARGET_CONFIRM: 'plan070:remote.example.net',
    SEED_TARGET_SSL_ROOT_CERT: caPath,
    E2E_PASSWORD: ['x'.repeat(18), 'A', '1'].join(''),
    REQUIRE_RLS_INTEGRATION: '0',
  } : {}),
};
const counts = { evaluations: 0, drivers: 0, sockets: 0, reads: 0, writes: 0, dotenv: 0 };
globalThis.pilotPreflightProbe = counts;
const opened = [];
globalThis.pilotTlsDriver = (url, options) => {
  counts.drivers++;
  const client = postgres(url, { ...options, socket() { counts.sockets++; throw new Error('Unexpected connection'); } });
  opened.push(client);
  return client;
};
const databaseSource = [
  'const counts = globalThis.pilotPreflightProbe;',
  'counts.evaluations++;',
  'const read = () => { counts.reads++; throw new Error("Unexpected database read"); };',
  'const write = () => { counts.writes++; throw new Error("Unexpected database write"); };',
  'export const db = { query: { user: { findFirst: read, findMany: read } },',
  '  insert: write, update: write, delete: write };',
  'export const claims = {}, claimMessages = {}, claimStageHistory = {}, user = {};',
  'export const notifications = {}, claimDocuments = {}, claimEscalationAgreements = {};',
  'export const claimLifecycleFieldsForStatus = () => ({});',
  'export const claimStatusFromLifecycleFields = () => "submitted";',
  'export const eq = () => ({});',
].join('\n');
const databaseUrl = 'data:text/javascript,' + encodeURIComponent(databaseSource);
const dotenvUrl = 'data:text/javascript,' + encodeURIComponent(
  'export default { config() { globalThis.pilotPreflightProbe.dotenv++;' +
  'Object.assign(process.env, ' + JSON.stringify(dotenvEnv) + '); } };'
);
const pilot = new URL('./scripts/pilot/' + entry + '.ts', import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'postgres') return { url: 'pilot:driver', shortCircuit: true };
    if (specifier === 'dotenv') {
      return { url: dotenvUrl, shortCircuit: true };
    }
    // Schema subpaths also initialize database code and must stay behind preflight.
    if (specifier === '@interdomestik/database' || specifier.startsWith('@interdomestik/database/')) {
      if (dotenvPassword) {
        assert.equal(globalThis.queryClientAdmin.options.ssl.ca, TEST_CA_PEM);
        assert.equal(globalThis.queryClientAdmin.options.ssl.rejectUnauthorized, true);
        return { url: databaseUrl, shortCircuit: true };
      }
      const approved = process.env.DATABASE_URL;
      if (mode === 'drift') {
        process.env.DATABASE_URL = approved + '?database=unapproved_db&user=other_role';
      }
      const client = postgres(process.env.DATABASE_URL, {
        max: 1,
        socket() { counts.sockets++; throw new Error('Unexpected connection'); },
      });
      counts.drivers++;
      opened.push(client);
      globalThis.queryClientAdmin = client;
      globalThis.queryClientRls = client;
      process.env.DATABASE_URL = approved;
      return { url: databaseUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'pilot:driver') return { format: 'module', shortCircuit: true, source: 'export default globalThis.pilotTlsDriver;' };
    // Pilot entries use ESM/top-level await in a package without type: module.
    if (url === pilot) {
      return {
        format: 'module', shortCircuit: true,
        source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8')),
      };
    }
    return nextLoad(url, context);
  },
});
const originalExit = process.exit;
const originalError = console.error;
const originalLog = console.log;
let refusal;
let exitCode;
process.exit = code => { exitCode = code; throw new Error('Intercepted exit'); };
console.error = (_label, error) => { refusal = error?.message; };
console.log = () => undefined;
try {
  try {
    const loaded = await import(pilot);
    if (entry === 'scenario_helpers') await loaded.loadPilotScenarioContext();
  } catch (error) {
    if (error.message !== 'Intercepted exit') refusal = error.message;
  }
} finally {
  const { closeSeedTargetClients } = await import('./packages/database/src/seed-target-guard.ts');
  await closeSeedTargetClients();
  rmSync(directory, { recursive: true, force: true });
  hooks.deregister();
  process.exit = originalExit;
  console.error = originalError;
  console.log = originalLog;
  delete globalThis.queryClientAdmin;
  delete globalThis.queryClientRls;
  await Promise.all(opened.map(client => client.end()));
}
let expectedRefusal = 'Seed target refused: client-mismatch';
if (mode === 'remote') expectedRefusal = 'Seed target refused: non-local-unconfirmed';
if (refusedImportMode) expectedRefusal = 'Pilot writers refuse REQUIRE_RLS_INTEGRATION/production database imports';
// Successful preflights reach the read sentinel; the fixture never executes real SQL.
if (dotenvPassword) expectedRefusal = 'Unexpected database read';
assert.equal(refusal, expectedRefusal);
const expectedImports = mode === 'remote' || refusedImportMode ? 0 : 1;
assert.equal(counts.evaluations, expectedImports, 'database module evaluations');
assert.equal(counts.drivers, expectedImports, 'driver constructions');
assert.equal(counts.sockets, 0, 'driver connections');
assert.equal(counts.reads, dotenvPassword ? 1 : 0, 'database reads');
assert.equal(counts.writes, 0, 'database writes');
assert.equal(counts.dotenv, entry === 'day1_run3_lifecycle' ? 0 : 1, 'dotenv precedes preflight');
if (exitCode !== undefined) assert.equal(exitCode, 1);
`;

for (const entry of [
  'simulate_agent_claim',
  'simulate_triage',
  'day1_run3_lifecycle',
  'scenario_helpers',
]) {
  const modes = ['remote', 'drift', 'rls:1', 'rls:', 'rls:false', 'rls:01', 'production'];
  if (entry !== 'day1_run3_lifecycle') modes.push('dotenv-password');
  for (const mode of modes) {
    const behavior =
      mode === 'dotenv-password'
        ? 'admits a confirmed remote target with a dotenv-only password'
        : 'refuses ' + mode + ' before database access';
    test(`${entry} ${behavior}`, () => {
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', '--input-type=module', '--eval', probe, entry, mode],
        { cwd: new URL('../../../', import.meta.url), encoding: 'utf8', timeout: 30_000 }
      );
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr + result.stdout);
    });
  }
}
