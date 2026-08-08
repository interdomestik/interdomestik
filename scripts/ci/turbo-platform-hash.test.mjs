import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = process.cwd();
const turbo = path.join(repoRoot, 'node_modules', '.bin', 'turbo');

function dryRunWithKey(key) {
  const result = spawnSync(
    turbo,
    ['run', 'lint', '--filter=@interdomestik/ui', '--dry=json', '--cache=local:r', '--no-daemon'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, INTERDOMESTIK_TURBO_PLATFORM_KEY: JSON.stringify(key) },
    }
  );
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const task = summary.tasks.find(candidate => candidate.package === '@interdomestik/ui');
  assert.ok(task, 'expected the UI lint task in the Turbo dry-run');
  return task.hash;
}

test('platform key content changes the repository-pinned Turbo task hash', () => {
  const darwin = dryRunWithKey({ platform: 'darwin', arch: 'arm64', nodeMajor: 24 });
  const linux = dryRunWithKey({ platform: 'linux', arch: 'x64', nodeMajor: 24 });

  assert.notEqual(darwin, linux);
});
