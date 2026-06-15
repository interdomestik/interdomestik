import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runner = readFileSync(new URL('../run-e2e-lane.mjs', import.meta.url), 'utf8');
const helper = readFileSync(new URL('run-detached-command.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
);

test('E2E lane runner cleanup contracts', () => {
  assert.match(runner, /\{ cleanupE2ePort, runDetachedCommand \}.*run-detached-command\.mjs/);
  assert.match(runner, /await runDetachedCommand\(command, args, \{ cwd: rootDir, env \}\)/);
  assert.match(runner, /finally \{\s*cleanupE2ePort\(\{ env: finalEnv \}\);\s*\}/s);
  assert.match(runner, /process\.exitCode = error\?\.exitCode \?\? 1/);
  assert.doesNotMatch(runner, /process\.exit\(error\?\.exitCode \?\? 1\)/);
});

test('detached helper cleanup contracts', () => {
  for (const pattern of [
    /detached: true/,
    /process\.platform === 'win32' \? pid : -pid/,
    /process\.once\('exit', \(\) => stopActiveProcessGroups\(\)\)/,
    /stopActiveProcessGroups\(signal\)/,
    /execFileSync\('lsof', \[`-tiTCP:\$\{port\}`, '-sTCP:LISTEN'\]/,
    /env\.PW_EXTERNAL_SERVER === '1'/,
    /stopProcessGroup\(pid, 'SIGKILL'\)/,
  ]) {
    assert.match(helper, pattern);
  }
});

test('root package keeps E2E contract scripts wired', () => {
  const scripts = packageJson.scripts;
  assert.equal(scripts['e2e:state:setup'], 'node scripts/run-e2e-lane.mjs state');
  assert.equal(
    scripts['test:ci:contracts'],
    'node --test --test-concurrency=1 scripts/ci/*.test.mjs scripts/check-modularity-guard.test.mjs'
  );
});
