import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = process.cwd();
const COMMON_PATH = path.join(ROOT, 'scripts/multi-agent/pr-hardening-common.sh');

function evaluateAllowedPath(pathToCheck) {
  const result = spawnSync(
    'bash',
    [
      '-lc',
      `source "${COMMON_PATH}" && if is_role_contract_write_allowed_path "${pathToCheck}"; then echo ALLOW; else echo DENY; fi`,
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('allows generated Next.js environment declarations', () => {
  assert.equal(evaluateAllowedPath('apps/web/next-env.d.ts'), 'ALLOW');
});

test('continues to forbid product source writes', () => {
  assert.equal(evaluateAllowedPath('apps/web/src/proxy.ts'), 'DENY');
  assert.equal(evaluateAllowedPath('packages/domain-users/src/index.ts'), 'DENY');
});
