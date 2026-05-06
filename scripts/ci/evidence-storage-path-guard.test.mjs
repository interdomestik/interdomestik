import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const guardScript = path.join(repoRoot, 'scripts/check-evidence-storage-paths.mjs');

function makeTempRepo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-evidence-path-'));
  fs.mkdirSync(path.join(tempRoot, 'apps/web/src/features/claims/upload/server'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(tempRoot, 'apps/web/src/features/claims/upload/server/storage-path.ts'),
    'export const approved = `pii/tenants/${tenantId}/claims/${claimId}/${fileId}.pdf`;\n',
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

test('evidence path guard permits only the centralized storage-path module', () => {
  const tempRoot = makeTempRepo();
  const routePath = path.join(tempRoot, 'apps/web/src/app/api/uploads/_core.ts');
  fs.mkdirSync(path.dirname(routePath), { recursive: true });
  fs.writeFileSync(
    routePath,
    'const path = `pii/tenants/${tenantId}/claims/${claimId}/${fileId}.pdf`;\n',
    'utf8'
  );

  const failed = runGuard(tempRoot);
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stderr, /_core\.ts/);

  fs.writeFileSync(
    routePath,
    "const path = buildEvidenceStoragePath({ bucket, claimId, fileId, fileName, shape: 'assigned', tenantId });\n",
    'utf8'
  );

  const passed = runGuard(tempRoot);
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /Evidence storage path guard passed/);
});

test('evidence path guard catches concatenated and joined raw evidence paths', () => {
  const tempRoot = makeTempRepo();
  const routePath = path.join(tempRoot, 'apps/web/src/app/api/uploads/_core.ts');
  fs.mkdirSync(path.dirname(routePath), { recursive: true });
  fs.writeFileSync(
    routePath,
    [
      "const concatenated = 'pii/tenants/' + tenantId + '/claims/' + claimId + '/' + fileId + '.pdf';",
      "const multiline = 'pii/tenants/' +",
      "  tenantId +",
      "  '/claims/' +",
      "  claimId +",
      "  '/' + fileId + '.pdf';",
      "const splitPrefix = 'pii' + '/tenants/' + tenantId + '/claims/' + claimId + '/' + fileId + '.pdf';",
      "const joined = ['pii', 'tenants', tenantId, 'claims', claimId, `${fileId}.pdf`].join('/');",
    ].join('\n'),
    'utf8'
  );

  const failed = runGuard(tempRoot);
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stderr, /string concatenation/);
  assert.match(failed.stderr, /split string concatenation/);
  assert.match(failed.stderr, /joined path segments/);
});

test('evidence path guard does not block policies bucket path templates', () => {
  const tempRoot = makeTempRepo();
  const policyPath = path.join(tempRoot, 'apps/web/src/app/api/policies/analyze/_services.ts');
  fs.mkdirSync(path.dirname(policyPath), { recursive: true });
  fs.writeFileSync(
    policyPath,
    'const path = `pii/tenants/${tenantId}/policies/${userId}/${fileId}.pdf`;\n',
    'utf8'
  );

  const result = runGuard(tempRoot);
  assert.equal(result.status, 0, result.stderr);
});
