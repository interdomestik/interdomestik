import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { runDetachedCommand } from './run-detached-command.mjs';

function nodeTestEnv() {
  return { PATH: process.env.PATH || '' };
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

async function waitForStopped(pid) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!isProcessAlive(pid)) return;
    await delay(100);
  }
  assert.equal(isProcessAlive(pid), false);
}

async function waitForFile(file) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(file)) return;
    await delay(100);
  }
  assert.fail(`Timed out waiting for ${file}`);
}

test('runDetachedCommand terminates orphaned descendants from the child process group', async t => {
  if (process.platform === 'win32') {
    t.skip('process groups use POSIX signal semantics');
    return;
  }

  const tempDir = mkdtempSync(path.join(tmpdir(), 'run-detached-command-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const pidFile = path.join(tempDir, 'descendant.pid');
  const script = `
    const { spawn } = require('node:child_process');
    const { writeFileSync } = require('node:fs');
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    });
    writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
    setTimeout(() => process.exit(0), 100);
  `;

  await runDetachedCommand(process.execPath, ['-e', script], { cwd: tempDir, env: nodeTestEnv() });
  const descendantPid = Number(readFileSync(pidFile, 'utf8'));

  assert.ok(Number.isInteger(descendantPid));
  await waitForStopped(descendantPid);
});

test('runDetachedCommand propagates non-zero child exit status', async () => {
  await assert.rejects(
    runDetachedCommand(process.execPath, ['-e', 'process.exit(7)'], {
      cwd: process.cwd(),
      env: nodeTestEnv(),
    }),
    error => error?.exitCode === 7
  );
});

test('runDetachedCommand rejects spawn failures without a secondary close error', async () => {
  await assert.rejects(
    runDetachedCommand('/definitely/missing/interdomestik-command', [], {
      cwd: process.cwd(),
      env: nodeTestEnv(),
    }),
    error => error?.code === 'ENOENT'
  );
});

test(
  'runDetachedCommand signal handler terminates an active child process group',
  { timeout: 25000 },
  async t => {
    if (process.platform === 'win32') {
      t.skip('process groups use POSIX signal semantics');
      return;
    }

    const tempDir = mkdtempSync(path.join(tmpdir(), 'run-detached-command-signal-'));
    t.after(() => rmSync(tempDir, { recursive: true, force: true }));

    const pidFile = path.join(tempDir, 'signal-descendant.pid');
    const helperUrl = new URL('run-detached-command.mjs', import.meta.url).href;
    const controllerScript = `
    import { runDetachedCommand } from ${JSON.stringify(helperUrl)};
    await runDetachedCommand(process.execPath, ['-e', ${JSON.stringify(`
      const { spawn } = require('node:child_process');
      const { writeFileSync } = require('node:fs');
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: 'ignore',
      });
      writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
      setInterval(() => {}, 1000);
    `)}], { cwd: ${JSON.stringify(tempDir)}, env: process.env });
  `;

    const controller = spawn(process.execPath, ['--input-type=module', '-e', controllerScript], {
      cwd: tempDir,
      env: nodeTestEnv(),
      stdio: 'ignore',
    });

    await waitForFile(pidFile);
    const descendantPid = Number(readFileSync(pidFile, 'utf8'));
    process.kill(controller.pid, 'SIGTERM');

    const [code] = await once(controller, 'exit');
    assert.equal(code, 143);
    await waitForStopped(descendantPid);
  }
);
