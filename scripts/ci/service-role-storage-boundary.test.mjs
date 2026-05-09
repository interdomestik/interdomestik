import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const guardScript = path.join(repoRoot, 'scripts/check-service-role-storage-boundary.mjs');

function makeTempRepo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-storage-boundary-'));
  fs.mkdirSync(path.join(tempRoot, 'apps/web/src/lib/storage'), { recursive: true });
  fs.writeFileSync(
    path.join(tempRoot, 'apps/web/src/lib/storage/service-role.ts'),
    'createAdminClient().storage.from(bucket).download(path);\n',
    'utf8'
  );
  return tempRoot;
}

function runGuard(root) {
  return spawnSync(process.execPath, [guardScript, `--root=${root}`], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('service-role storage boundary guard blocks direct admin Storage access', () => {
  const tempRoot = makeTempRepo();
  const routePath = path.join(tempRoot, 'apps/web/src/app/api/documents/route.ts');
  fs.mkdirSync(path.dirname(routePath), { recursive: true });
  fs.writeFileSync(
    routePath,
    'const adminClient = createAdminClient();\nawait adminClient.storage.from(bucket).download(path);\n',
    'utf8'
  );

  const failed = runGuard(tempRoot);
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stderr, /direct createAdminClient Storage access/);
});

test('service-role storage boundary guard blocks direct service-role Storage clients', () => {
  const tempRoot = makeTempRepo();
  const routePath = path.join(tempRoot, 'apps/web/src/actions/uploads/upload.ts');
  fs.mkdirSync(path.dirname(routePath), { recursive: true });
  fs.writeFileSync(
    routePath,
    'const key = process.env.SUPABASE_SERVICE_ROLE_KEY;\nawait client.storage.from(bucket).upload(path, body);\n',
    'utf8'
  );

  const failed = runGuard(tempRoot);
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stderr, /direct SUPABASE_SERVICE_ROLE_KEY Storage access/);
});

test('service-role storage boundary guard permits centralized boundary usage', () => {
  const tempRoot = makeTempRepo();
  const routePath = path.join(tempRoot, 'apps/web/src/app/api/documents/route.ts');
  fs.mkdirSync(path.dirname(routePath), { recursive: true });
  fs.writeFileSync(
    routePath,
    "await downloadTenantObject({ bucket, family: 'claims', path, tenantId });\n",
    'utf8'
  );

  const passed = runGuard(tempRoot);
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /Service-role storage boundary guard passed/);
});
