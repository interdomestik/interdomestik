import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function runTypeScript(source) {
  return execFileSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', source],
    { cwd: rootDir, encoding: 'utf8' }
  ).trim();
}

test('filtered package execution resolves the canonical repository root', () => {
  const output = runTypeScript(
    "import { REPO_ROOT } from './packages/qa/src/utils/paths.ts'; console.log(REPO_ROOT)"
  );
  assert.equal(fs.realpathSync.native(output.trim()), fs.realpathSync.native(rootDir));
});

test('audit classification gives explicit and textual failures precedence', () => {
  const statuses = JSON.parse(
    runTypeScript(`
      import { classifyAuditResult } from './packages/qa/src/utils/audit-result.ts';
      console.log(JSON.stringify([
        classifyAuditResult({ isError: true, structuredContent: { status: 'fail' } }, '✅ passed\\n❌ failed'),
        classifyAuditResult({ isError: false, structuredContent: { status: 'pass' } }, '✅ passed\\nFailed checks: 0'),
        classifyAuditResult({}, '✅ partial\\n❌ failed')
      ]));
    `)
  );
  assert.deepEqual(statuses, ['fail', 'pass', 'fail']);
});

test('unknown suites retain validated worktree provenance', () => {
  const result = JSON.parse(
    runTypeScript(`
      import { runTestsOrchestrator } from './packages/qa/src/tools/tests.ts';
      console.log(JSON.stringify(await runTestsOrchestrator({
        repoRoot: ${JSON.stringify(rootDir)}, suite: 'unknown-suite'
      })));
    `)
  );
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.repoRoot, fs.realpathSync.native(rootDir));
  assert.equal(result.structuredContent.repoRootSource, 'tool-argument');
  assert.equal(result.structuredContent.status, 'fail');
});

test('QA CLI injects repoRoot and fails on JSON-RPC or tool errors', () => {
  const source = fs.readFileSync(path.join(rootDir, 'packages/qa/test-tools.ts'), 'utf8');
  assert.match(source, /arguments: \{ \.\.\.args, repoRoot: REPO_ROOT \}/);
  assert.match(
    source,
    /response\.error \|\| !response\.result \|\| response\.result\.isError === true/
  );
  assert.match(source, /process\.exitCode = 1/);
  assert.doesNotMatch(source, /process\.exit\(0\)/);
});

test('canonical MCP CLI injects its worktree root and rejects hidden tools', () => {
  const success = spawnSync(
    process.execPath,
    ['scripts/mcp-tool.mjs', 'call', 'git_status_compact', '{}', '--text'],
    { cwd: rootDir, encoding: 'utf8', timeout: 30000 }
  );
  assert.equal(success.status, 0, success.stderr);
  assert.doesNotMatch(success.stdout, /repoRoot is required/);

  const hidden = spawnSync(
    process.execPath,
    ['scripts/mcp-tool.mjs', 'call', 'audit_supabase', '{}', '--text'],
    { cwd: rootDir, encoding: 'utf8', timeout: 30000 }
  );
  assert.notEqual(hidden.status, 0);
  assert.match(hidden.stderr, /not enabled on this MCP surface/);
});

test('read_files reports nonexistent targets as failures', () => {
  const result = JSON.parse(
    runTypeScript(`
      import { handleToolCall } from './packages/qa/src/tool-router.ts';
      console.log(JSON.stringify(await handleToolCall('read_files', {
        files: ['__qa_missing_file__'], repoRoot: ${JSON.stringify(rootDir)}
      })));
    `)
  );
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.failures, 1);
  assert.equal(result.structuredContent.status, 'error');
});

test('repo file tools reject non-string paths with structured failures', () => {
  const results = JSON.parse(
    runTypeScript(`
      import { handleToolCall } from './packages/qa/src/tool-router.ts';
      console.log(JSON.stringify(await Promise.all([
        handleToolCall('read_files', {
          files: [null, 42, ''], repoRoot: ${JSON.stringify(rootDir)}
        }),
        handleToolCall('read_file_range', {
          file: null, repoRoot: ${JSON.stringify(rootDir)}
        })
      ])));
    `)
  );
  assert.equal(results[0].structuredContent.failures, 3);
  assert.equal(results[0].structuredContent.status, 'error');
  assert.equal(results[1].structuredContent.status, 'error');
  assert.match(results.map(result => result.content[0].text).join('\n'), /non-empty string/);
});

test('QA CLI fails immediately when its MCP server exits before responding', () => {
  const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-cli-fake-pnpm-'));
  try {
    const fakePnpm = path.join(fakeBin, 'pnpm');
    fs.writeFileSync(fakePnpm, '#!/bin/sh\nexit 23\n', { mode: 0o755 });
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'packages/qa/test-tools.ts'], {
      cwd: rootDir,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
      timeout: 5000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /server exited before responding.*code=23/);
  } finally {
    fs.rmSync(fakeBin, { recursive: true });
  }
});
