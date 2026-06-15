import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runner = readFileSync(new URL('../run-e2e-lane.mjs', import.meta.url), 'utf8');

test('E2E lane runner terminates leftover child process groups after subprocess exits', () => {
  assert.match(runner, /function stopProcessGroup\(pid\)/);
  assert.match(runner, /process\.kill\(-pid, 'SIGTERM'\)/);
  assert.match(
    runner,
    /spawnSync\(command, args, \{ cwd: rootDir, detached: true, env, stdio: 'inherit' \}\)/
  );
  assert.match(runner, /stopProcessGroup\(result\.pid\)/);
});
