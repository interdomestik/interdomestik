import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const guardScript = path.join(repoRoot, 'scripts/check-next-typescript-build-integrity.mjs');

function makeTempRepo(configSource) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-next-ts-'));
  const configPath = path.join(tempRoot, 'apps/web/next.config.mjs');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, configSource, 'utf8');
  return tempRoot;
}

function runGuard(root) {
  return spawnSync(process.execPath, [guardScript, `--root=${root}`], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('Next TypeScript build integrity guard blocks ignoreBuildErrors', () => {
  const tempRoot = makeTempRepo(
    "export default { typescript: { ignoreBuildErrors: process.env.VERCEL === '1' } };\n"
  );

  const failed = runGuard(tempRoot);
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stderr, /do not set typescript\.ignoreBuildErrors/);
});

test('Next TypeScript build integrity guard permits enforced TypeScript builds', () => {
  const tempRoot = makeTempRepo("export default { output: 'standalone' };\n");

  const passed = runGuard(tempRoot);
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /ignoreBuildErrors is not set/);
});
