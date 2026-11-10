import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// scripts/pilot writers (U3-R3). A fresh process per case preserves first-import behavior and
// isolates cached clients; the probe runs from the repository root.
const probe = String.raw`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import postgres from 'postgres';

const [entry, mode] = process.argv.slice(1);
const target = mode === 'remote'
  ? 'postgres://u:p@remote.example.net/db'
  : 'postgres://fixture@localhost:5432/approved_db';
process.env = {
  NODE_ENV: 'test',
  NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT,
  DATABASE_URL: entry === 'day1_run3_lifecycle' ? target
    : 'postgres://fixture@localhost:5432/approved_db',
};
const counts = { evaluations: 0, drivers: 0, sockets: 0, reads: 0, writes: 0, dotenv: 0 };
globalThis.pilotPreflightProbe = counts;
const opened = [];
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
  'process.env.DATABASE_URL = ' + JSON.stringify(target) + '; } };'
);
const pilot = new URL('./scripts/pilot/' + entry + '.ts', import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'dotenv') {
      return { url: dotenvUrl, shortCircuit: true };
    }
    // Schema subpaths also initialize database code and must stay behind preflight.
    if (specifier === '@interdomestik/database' || specifier.startsWith('@interdomestik/database/')) {
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
  hooks.deregister();
  process.exit = originalExit;
  console.error = originalError;
  console.log = originalLog;
  delete globalThis.queryClientAdmin;
  delete globalThis.queryClientRls;
  await Promise.all(opened.map(client => client.end()));
}
assert.equal(refusal, 'Seed target refused: ' + (mode === 'remote' ? 'non-local-unconfirmed' : 'client-mismatch'));
assert.equal(counts.evaluations, mode === 'remote' ? 0 : 1, 'database module evaluations');
assert.equal(counts.drivers, mode === 'remote' ? 0 : 1, 'driver constructions');
assert.equal(counts.sockets, 0, 'driver connections');
assert.equal(counts.reads, 0, 'database reads');
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
  for (const mode of ['remote', 'drift']) {
    test(`${entry} refuses ${mode} before database access`, () => {
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
