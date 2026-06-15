import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { cleanupE2ePort } from './run-detached-command.mjs';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const runner = read('../run-e2e-lane.mjs');

test('runner cleanup contracts', () => {
  assert.match(runner, /\{ cleanupE2ePort, runDetachedCommand \}.*run-detached-command\.mjs/);
  assert.match(runner, /await runDetachedCommand\(command, args, \{ cwd: rootDir, env \}\)/);
  assert.match(runner, /finally \{\s*cleanupE2ePort\(\{ env: finalEnv \}\);\s*\}/s);
  assert.match(runner, /process\.exitCode = error\?\.exitCode \?\? 1/);
  assert.doesNotMatch(runner, /process\.exit\(error\?\.exitCode \?\? 1\)/);
});

test('port cleanup kills non-group-leader listeners', async () => {
  const code =
    "require('net').createServer().listen(0,'127.0.0.1',function(){console.log(this.address().port)})";
  const child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const [line] = await once(child.stdout, 'data');
    const port = Number.parseInt(String(line), 10);
    assert.ok(port > 0);
    assert.deepEqual(cleanupE2ePort({ env: {}, port }), [child.pid]);
    await once(child, 'exit');
    assert.deepEqual(cleanupE2ePort({ env: {}, port }), []);
  } finally {
    if (!child.killed) child.kill('SIGKILL');
  }
});
