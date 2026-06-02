import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');
const guardScript = path.join(rootDir, 'scripts/check-e2e-tenant-host-lanes.mjs');

function readRepoText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function readRepoJson(relativePath) {
  return JSON.parse(readRepoText(relativePath));
}

function createTempRepo(t) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-tenant-host-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  return tempRoot;
}

function writeFile(tempRoot, relativePath, content) {
  const filePath = path.join(tempRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function runGuard(cwd, extraArgs = []) {
  return spawnSync(process.execPath, [guardScript, ...extraArgs], {
    cwd,
    encoding: 'utf8',
  });
}

test('tenant-host lane guard is wired into E2E contract checks', () => {
  const packageJson = readRepoJson('package.json');

  assert.equal(
    packageJson.scripts['check:e2e-tenant-host-lanes'],
    'node scripts/check-e2e-tenant-host-lanes.mjs'
  );
  assert.match(packageJson.scripts['check:e2e-contracts'], /pnpm check:e2e-tenant-host-lanes/u);
  assert.match(packageJson.scripts['pr:verify'], /pnpm check:e2e-contracts/u);
});

test('tenant-host lane guard passes current inventoried alias and regression files', () => {
  const result = runGuard(rootDir);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /E2E tenant-host lane guard passed/u);
  assert.match(result.stdout, /12 projects, 17 files inventoried/u);
});

test('tenant-host lane guard blocks new dashboard or auth specs from using host as tenant identity', t => {
  const tempRoot = createTempRepo(t);

  writeFile(
    tempRoot,
    'apps/web/playwright.config.ts',
    readRepoText('apps/web/playwright.config.ts')
  );
  writeFile(
    tempRoot,
    'apps/web/e2e/auth/new-front-door.spec.ts',
    [
      "import { test } from '@playwright/test';",
      '',
      "test('new auth flow', async ({ page }) => {",
      "  await page.setExtraHTTPHeaders({ 'X-Forwarded-Host': 'ks.localhost:3000' });",
      "  await page.goto('/sq/login');",
      '});',
      '',
    ].join('\n')
  );

  const result = runGuard(tempRoot);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /tenant-host-identity-usage/u);
  assert.match(result.stderr, /new-front-door\.spec\.ts/u);
  assert.match(result.stderr, /Use ida\/session-context setup/u);
});

test('tenant-host lane guard blocks direct country-host project baseURL literals', t => {
  const tempRoot = createTempRepo(t);

  writeFile(
    tempRoot,
    'apps/web/playwright.config.ts',
    [
      'export default {',
      '  projects: [',
      '    {',
      "      name: 'new-country-host-lane',",
      "      use: { baseURL: 'http://KS.localhost:3000/sq' },",
      '    },',
      '  ],',
      '};',
      '',
    ].join('\n')
  );

  const result = runGuard(tempRoot);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /new-country-host-lane/u);
  assert.match(result.stderr, /uses tenant-host routing/u);
});

test('tenant-host lane guard inspects spread conditional project arrays', t => {
  const tempRoot = createTempRepo(t);

  writeFile(
    tempRoot,
    'apps/web/playwright.config.ts',
    [
      'const ENABLE_NEW_LANE = true;',
      'export default {',
      '  projects: [',
      '    ...(ENABLE_NEW_LANE',
      '      ? [',
      '          {',
      "            name: 'spread-country-host-lane',",
      '            use: { baseURL: tenantBaseUrl(KS_HOST, "sq") },',
      '          },',
      '        ]',
      '      : []),',
      '  ],',
      '};',
      '',
    ].join('\n')
  );

  const result = runGuard(tempRoot);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /spread-country-host-lane/u);
  assert.match(result.stderr, /uses tenant-host routing/u);
});
