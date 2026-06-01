import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const guardScript = path.join(repoRoot, 'scripts/check-raw-role-arrays.mjs');

function makeTempRepo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-raw-role-array-'));
  fs.mkdirSync(path.join(tempRoot, 'apps/web/src/app/api/admin'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'packages/shared-auth/src'), { recursive: true });
  return tempRoot;
}

function runGuard(root) {
  return spawnSync(process.execPath, [guardScript, `--root=${root}`], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('raw role-array guard blocks unapproved inline role arrays', () => {
  const tempRoot = makeTempRepo();
  fs.writeFileSync(
    path.join(tempRoot, 'apps/web/src/app/api/admin/route.ts'),
    "const allowedRoles = ['admin', 'staff'];\n",
    'utf8'
  );

  const failed = runGuard(tempRoot);
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stderr, /Raw role-array guard failed/);
  assert.match(failed.stderr, /\['admin', 'staff'\]/);
});

test('raw role-array guard permits shared role constants and test fixtures', () => {
  const tempRoot = makeTempRepo();
  fs.writeFileSync(
    path.join(tempRoot, 'apps/web/src/app/api/admin/route.ts'),
    'const allowedRoles = [ROLES.admin, ROLES.staff];\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(tempRoot, 'packages/shared-auth/src/permissions.test.ts'),
    "const fixtureRoles = ['admin', 'staff'];\n",
    'utf8'
  );

  const passed = runGuard(tempRoot);
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /Raw role-array guard passed/);
});

test('repo raw role-array baseline is explicit and current', () => {
  const passed = runGuard(repoRoot);
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /Raw role-array guard passed/);
});
