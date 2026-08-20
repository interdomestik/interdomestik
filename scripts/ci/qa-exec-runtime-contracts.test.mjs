import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
function runModuleExpression(modulePath, expression) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, modulePath)).href;
  const script = `
    const mod = await import(${JSON.stringify(moduleUrl)});
    const result = await (${expression});
    console.log(JSON.stringify(result));
  `;

  const stdout = execFileSync(process.execPath, ['--import', 'tsx', '--eval', script], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  return JSON.parse(stdout);
}

test('runSecurityGuard returns structured content with command metadata', () => {
  const result = runModuleExpression(
    'packages/qa/src/tools/tests.ts',
    `mod.runSecurityGuard({ repoRoot: ${JSON.stringify(repoRoot)} })`
  );

  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.tool, 'security_guard');
  assert.equal(result.structuredContent.status, 'pass');
  assert.equal(result.structuredContent.command, 'pnpm security:guard');
  assert.equal(result.structuredContent.failedStage, null);
  assert.equal(result.structuredContent.repoRoot, repoRoot);
  assert.equal(result.structuredContent.repoRootSource, 'tool-argument');
  assert.equal(typeof result.structuredContent.durationMs, 'number');
  assert.match(result.content[0].text, /SECURITY GUARD PASSED/);
});

test('execAsync classifies failed check:fast output by the active stage marker', () => {
  const result = runModuleExpression(
    'packages/qa/src/utils/exec.ts',
    String.raw`mod.classifyVerificationFailure('pnpm check:fast', ['> interdomestik@0.1.0 e2e:state:setup /repo', 'boom'].join('\n'))`
  );

  assert.equal(result.failedStage, 'e2e_state_setup');
  assert.equal(result.failureCategory, 'e2e');
});

test('execAsync truncates oversized stdout without failing the command', () => {
  const result = runModuleExpression(
    'packages/qa/src/utils/exec.ts',
    `mod.execAsync({ file: ${JSON.stringify(process.execPath)}, args: ['-e', ${JSON.stringify(
      "process.stdout.write('x'.repeat(20000))"
    )}] }, { cwd: ${JSON.stringify(repoRoot)}, maxOutputBytes: 1024 })`
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdoutTruncated, true);
  assert.ok(result.stdout.length <= 1024);
  assert.equal(result.stderrTruncated, false);
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

test('repo-bound input validation precedes suite and file handling', () => {
  const unknownSuite = runModuleExpression(
    'packages/qa/src/tool-router.ts',
    `mod.handleToolCall('tests_orchestrator', { suite: 'unknown' })`
  );
  const missingFiles = runModuleExpression(
    'packages/qa/src/tool-router.ts',
    `mod.handleToolCall('read_files', { repoRoot: ${JSON.stringify(repoRoot)} })`
  );
  assert.match(unknownSuite.content[0].text, /repoRoot is required/);
  assert.match(missingFiles.content[0].text, /files must be an array/);
  assert.equal(missingFiles.structuredContent.repoRoot, repoRoot);
});

test('code_search treats option-like queries as patterns', () => {
  const result = runModuleExpression(
    'packages/qa/src/tools/repo-search.ts',
    `mod.codeSearch({ repoRoot: ${JSON.stringify(repoRoot)}, query: '--version' })`
  );
  assert.equal(result.isError, undefined);
  assert.doesNotMatch(result.content[0].text, /^ripgrep \d/m);
});
