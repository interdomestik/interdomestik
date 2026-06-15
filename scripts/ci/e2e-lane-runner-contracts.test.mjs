import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runner = readFileSync(new URL('../run-e2e-lane.mjs', import.meta.url), 'utf8');
const helper = readFileSync(new URL('run-detached-command.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
);

test('E2E lane runner delegates subprocess cleanup to the detached command helper', () => {
  assert.match(runner, /import \{ runDetachedCommand \} from '\.\/ci\/run-detached-command\.mjs'/);
  assert.match(runner, /await runDetachedCommand\(command, args, \{ cwd: rootDir, env \}\)/);
});

test('detached command helper terminates active process groups on exit and cancellation', () => {
  assert.match(helper, /detached: true/);
  assert.match(helper, /stdio: \['ignore', 'inherit', 'inherit'\]/);
  assert.match(helper, /process\.kill\(-pid, signal\)/);
  assert.match(helper, /error\?\.code === 'ESRCH'/);
  assert.match(helper, /process\.once\('exit', \(\) => stopActiveProcessGroups\(\)\)/);
  assert.match(helper, /process\.on\(signal, \(\) => \{/);
  assert.match(helper, /stopActiveProcessGroups\(signal\)/);
});

test('root package script exposes the hardened E2E state setup lane', () => {
  assert.equal(packageJson.scripts['e2e:state:setup'], 'node scripts/run-e2e-lane.mjs state');
});
