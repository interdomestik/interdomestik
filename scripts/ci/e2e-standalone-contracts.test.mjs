import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('e2e launchers resolve standalone server artifacts dynamically for worktree builds', () => {
  const webServerScript = readText('scripts/e2e-webserver.sh');
  const gateScript = readText('scripts/e2e-gate.sh');
  const stampScript = readText('apps/web/scripts/stamp-standalone.mjs');

  assert.match(webServerScript, /resolve_standalone_server\(\)/);
  assert.match(webServerScript, /resolve_standalone_app_root\(\)/);
  assert.match(webServerScript, /normalize_billing_test_mode\(\)/);
  assert.match(webServerScript, /stamp\.publicEnv\?\.NEXT_PUBLIC_BILLING_TEST_MODE/);
  assert.match(webServerScript, /STAMP_STATUS_REASON="stale-stamp-env"/);
  assert.match(webServerScript, /requested billingTestMode:/);
  assert.match(
    webServerScript,
    /find "\$\{STANDALONE_ROOT\}" -path '\*\/node_modules\/\*' -prune -o -type f -name server\.js -print/
  );
  assert.match(webServerScript, /dynamic find under \$\{STANDALONE_ROOT\}/);
  assert.match(webServerScript, /\[\[ ! -d "\$\{STANDALONE_ROOT\}" \]\] && return 1/);
  assert.match(webServerScript, /\[\[ -n "\$\{discovered_server\}" \]\] \|\| return 1/);

  assert.match(gateScript, /resolve_standalone_server\(\)/);
  assert.match(
    gateScript,
    /find "\$\{STANDALONE_ROOT\}" -path '\*\/node_modules\/\*' -prune -o -type f -name server\.js -print/
  );
  assert.match(gateScript, /\[\[ ! -d "\$\{STANDALONE_ROOT\}" \]\] && return 1/);
  assert.match(gateScript, /\[\[ -n "\$\{discovered_server\}" \]\] \|\| return 1/);
  assert.match(gateScript, /if ! resolve_standalone_server >\/dev\/null; then/);

  assert.match(stampScript, /NEXT_PUBLIC_BILLING_TEST_MODE/);
  assert.match(stampScript, /publicEnv/);
  assert.match(stampScript, /billingTestMode=/);
});
