import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { repoRoot, runModuleExpression } from './qa-exec-runtime-contracts.test-support.mjs';

test('execAsync preserves only the enrolled checkout admission for M5 Git children', () => {
  const checkout = fs.realpathSync.native(repoRoot);
  const result = runModuleExpression(
    'packages/qa/src/utils/exec.ts',
    `(async () => {
      const cp = (await import('node:child_process')).default;
      const os = (await import('node:os')).default;
      const { syncBuiltinESMExports } = await import('node:module');
      const { EventEmitter } = await import('node:events');
      const checkout = ${JSON.stringify(checkout)};
      process.env.INTERDOMESTIK_M5_CHECKOUT = checkout;
      process.env.GIT_CONFIG_COUNT = '1';
      process.env.GIT_CONFIG_KEY_0 = 'safe.directory';
      process.env.GIT_CONFIG_VALUE_0 = checkout;
      process.env.GIT_CONFIG_GLOBAL = '/untrusted';
      process.env.GIT_DIR = '/wrong';
      let username = '_interdomestik_gate_worker';
      os.userInfo = () => ({ username });
      const environments = [];
      cp.spawn = (_file, _args, { env }) => {
        environments.push(Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith('GIT_'))));
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        process.nextTick(() => child.emit('close', 0, null));
        return child;
      };
      syncBuiltinESMExports();
      const status = { file: 'git', args: ['status'] };
      await mod.execAsync(status, { cwd: checkout });
      await mod.execAsync(status, { cwd: os.tmpdir() });
      await mod.execAsync({ file: 'pnpm' }, { cwd: checkout });
      username = 'ordinary';
      await mod.execAsync(status, { cwd: checkout });
      username = '_interdomestik_gate_worker';
      process.env.GIT_CONFIG_VALUE_0 = '*';
      await mod.execAsync(status, { cwd: checkout });
      return environments;
    })()`
  );

  assert.deepEqual(result, [
    {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'safe.directory',
      GIT_CONFIG_VALUE_0: checkout,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_NO_REPLACE_OBJECTS: '1',
    },
    {},
    {},
    {},
    {},
  ]);
});

test('worktree env files are parsed per call without mutating process env', () => {
  const first = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-env-first-'));
  const second = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-env-second-'));
  try {
    fs.writeFileSync(path.join(first, '.env.local'), 'QA_MCP_WORKTREE_SENTINEL=first\n');
    fs.writeFileSync(path.join(second, '.env.local'), 'QA_MCP_WORKTREE_SENTINEL=second\n');
    const firstRoot = fs.realpathSync.native(first);
    const secondRoot = fs.realpathSync.native(second);
    const result = runModuleExpression(
      'packages/qa/src/utils/root-env.ts',
      `(async () => { delete process.env.QA_MCP_WORKTREE_SENTINEL; return {
        first: mod.loadToolEnv(${JSON.stringify(firstRoot)}).QA_MCP_WORKTREE_SENTINEL,
        second: mod.loadToolEnv(${JSON.stringify(secondRoot)}).QA_MCP_WORKTREE_SENTINEL,
        global: process.env.QA_MCP_WORKTREE_SENTINEL ?? null,
      }; })()`
    );
    assert.deepEqual(result, { first: 'first', global: null, second: 'second' });
  } finally {
    fs.rmSync(first, { recursive: true });
    fs.rmSync(second, { recursive: true });
  }
});

test('concurrent commands receive only their selected worktree env', () => {
  const first = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-env-concurrent-first-'));
  const second = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-env-concurrent-second-'));
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-env-concurrent-empty-'));
  try {
    fs.writeFileSync(path.join(first, '.env.local'), 'QA_MCP_WORKTREE_SENTINEL=first\n');
    fs.writeFileSync(path.join(second, '.env.local'), 'QA_MCP_WORKTREE_SENTINEL=second\n');
    const firstRoot = fs.realpathSync.native(first);
    const secondRoot = fs.realpathSync.native(second);
    const emptyRoot = fs.realpathSync.native(empty);
    const result = runModuleExpression(
      'packages/qa/src/utils/root-env.ts',
      `(async () => {
        const exec = await import(${JSON.stringify(
          pathToFileURL(path.join(repoRoot, 'packages/qa/src/utils/exec.ts')).href
        )});
        process.env.QA_MCP_WORKTREE_SENTINEL = 'server-root-only';
        const command = { file: process.execPath, args: ['-e', 'process.stdout.write(process.env.QA_MCP_WORKTREE_SENTINEL || "missing")'] };
        const [firstResult, secondResult, emptyResult] = await Promise.all([
          exec.execAsync(command, { cwd: ${JSON.stringify(firstRoot)}, env: mod.loadToolEnv(${JSON.stringify(firstRoot)}) }),
          exec.execAsync(command, { cwd: ${JSON.stringify(secondRoot)}, env: mod.loadToolEnv(${JSON.stringify(secondRoot)}) }),
          exec.execAsync(command, { cwd: ${JSON.stringify(emptyRoot)}, env: mod.loadToolEnv(${JSON.stringify(emptyRoot)}) }),
        ]);
        return { empty: emptyResult.stdout, first: firstResult.stdout, second: secondResult.stdout, global: process.env.QA_MCP_WORKTREE_SENTINEL };
      })()`
    );
    assert.deepEqual(result, {
      empty: 'missing',
      first: 'first',
      global: 'server-root-only',
      second: 'second',
    });
  } finally {
    fs.rmSync(first, { recursive: true });
    fs.rmSync(second, { recursive: true });
    fs.rmSync(empty, { recursive: true });
  }
});
