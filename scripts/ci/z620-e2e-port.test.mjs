import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Playwright accepts an isolated port and propagates it to trusted origins', () => {
  const source = `${read('apps/web/playwright.config.ts')}\n${read('apps/web/playwright-network.ts')}`;
  assert.match(source, /environment\.PW_PORT/);
  assert.match(source, /127\.0\.0\.1:\$\{PORT\}/);
  assert.doesNotMatch(source, /127\.0\.0\.1:3000/);
});

test('webserver tenant origins use the selected port', () => {
  const source = read('scripts/e2e-webserver.sh');
  assert.match(source, /ida\.127\.0\.0\.1\.nip\.io:\$\{PORT\}/);
  assert.doesNotMatch(source, /nip\.io:3000/);
});

test('gatekeeper checks only the selected task port', () => {
  const source = `${read('scripts/m4-gatekeeper.sh')}\n${read('scripts/e2e-port-guard.sh')}`;
  assert.match(source, /E2E_PORT="\$\{PW_PORT:-\$\{PORT:-3000\}\}"/);
  assert.match(source, /lsof -ti:"\$\{E2E_PORT\}"/);
  assert.doesNotMatch(source, /lsof -ti:3000/);
});

test('resource runner keeps gatekeeper and Playwright build modes aligned', () => {
  const source = read('scripts/ci/z620-resource-run.mjs');
  assert.match(source, /NEXT_PUBLIC_BILLING_TEST_MODE: '1'/);
  assert.match(source, /BILLING_TEST_MODE: '1'/);
  assert.match(source, /DATABASE_URL: databaseConnection/);
  assert.match(source, /DATABASE_URL_RLS: databaseConnection/);
  assert.match(source, /PILOT_HOST: `pilot\.127\.0\.0\.1\.nip\.io:\$\{reservation\.port\}`/);
  assert.match(source, /HOSTNAME: '127\.0\.0\.1'/);
  assert.match(source, /E2E_PASSWORD: e2ePassword/);
  assert.match(source, /RELEASE_GATE_ADMIN_MK_PASSWORD: e2ePassword/);
  assert.match(source, /PLAYWRIGHT: '1'/);
});

test('pilot gate owns its selected port, database, server, and release preparation', () => {
  const source = read('scripts/ci/z620-pilot-run.mjs');
  const gates = JSON.parse(read('scripts/ci/z620-gates.json'));
  assert.match(source, /port < 3100 \|\| port > 3199/);
  assert.match(source, /process\.env\.E2E_DATABASE_URL/);
  assert.match(source, /INTERDOMESTIK_TASK_OWNS_PORT/);
  assert.match(source, /HOSTNAME: '127\.0\.0\.1'/);
  assert.match(source, /\['--filter', '@interdomestik\/web', 'run', 'build:ci'\]/);
  assert.match(source, /release:gate:p0:raw/);
  assert.match(source, /Z620_EVIDENCE_DIR/);
  assert.match(source, /'--outDir'/);
  assert.match(source, /process\.kill\(-server\.pid, 'SIGTERM'\)/);
  assert.deepEqual(gates.lanes.pilot.commands, [['node', 'scripts/ci/z620-pilot-run.mjs']]);
});
