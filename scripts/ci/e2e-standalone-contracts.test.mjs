import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
  assert.match(stampScript, /syncClientReferenceManifests/);
  assert.match(stampScript, /standalone client reference manifests synced=/);
  assert.match(stampScript, /aliasRouteGroupClientReferenceManifests/);
  assert.match(stampScript, /_client-reference-manifest\.js/);
});

test('standalone stamp copies and aliases route-group client reference manifests', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'standalone-stamp-'));
  const stampScript = path.join(rootDir, 'apps/web/scripts/stamp-standalone.mjs');
  const routeGroupManifest = path.join(
    tempDir,
    '.next/server/app/[locale]/(agent)/agent/claims/page_client-reference-manifest.js'
  );
  const publicManifest = path.join(
    tempDir,
    '.next/server/app/[locale]/agent/claims/page_client-reference-manifest.js'
  );
  const standaloneRoots = [
    path.join(tempDir, '.next/standalone/apps/web/.next/server/app'),
    path.join(tempDir, '.next/standalone/.next/server/app'),
  ];

  fs.mkdirSync(path.dirname(routeGroupManifest), { recursive: true });
  fs.writeFileSync(routeGroupManifest, 'globalThis.__fixture = true;\n');
  for (const standaloneRoot of standaloneRoots) {
    fs.mkdirSync(standaloneRoot, { recursive: true });
  }

  const output = execFileSync(process.execPath, [stampScript], {
    cwd: tempDir,
    env: {
      ...process.env,
      COMMIT_SHA: 'fixture-sha',
      NEXT_PUBLIC_BILLING_TEST_MODE: '1',
    },
    encoding: 'utf8',
  });

  assert.equal(fs.readFileSync(publicManifest, 'utf8'), 'globalThis.__fixture = true;\n');
  for (const standaloneRoot of standaloneRoots) {
    assert.equal(
      fs.readFileSync(
        path.join(
          standaloneRoot,
          '[locale]/(agent)/agent/claims/page_client-reference-manifest.js'
        ),
        'utf8'
      ),
      'globalThis.__fixture = true;\n'
    );
    assert.equal(
      fs.readFileSync(
        path.join(standaloneRoot, '[locale]/agent/claims/page_client-reference-manifest.js'),
        'utf8'
      ),
      'globalThis.__fixture = true;\n'
    );
  }

  assert.match(output, /standalone client reference manifests synced=2/);
  assert.match(output, /route-group client reference manifest aliases=3/);
  assert.match(
    fs.readFileSync(path.join(tempDir, '.next/standalone/.build-stamp.json'), 'utf8'),
    /"NEXT_PUBLIC_BILLING_TEST_MODE": "1"/
  );
});
