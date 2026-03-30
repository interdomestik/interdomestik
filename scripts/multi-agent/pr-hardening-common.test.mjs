import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const COMMON_PATH = path.join(ROOT, 'scripts/multi-agent/pr-hardening-common.sh');
const ALLOWLIST_PATH = path.join(ROOT, 'scripts/multi-agent/pr-hardening-allowed-paths.json');

function readAllowlist() {
  return JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
}

test('allows generated Next.js environment declarations', () => {
  assert.deepEqual(readAllowlist(), ['apps/web/next-env.d.ts']);
});

test('continues to forbid product source writes', () => {
  const allowlist = readAllowlist();

  assert.ok(!allowlist.includes('apps/web/src/proxy.ts'));
  assert.ok(!allowlist.includes('packages/domain-users/src/index.ts'));
  assert.match(fs.readFileSync(COMMON_PATH, 'utf8'), /pr-hardening-allowed-paths\.json/);
});
