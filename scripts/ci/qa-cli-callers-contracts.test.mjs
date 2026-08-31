import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const controlTestEnv = {
  ...process.env,
  INTERDOMESTIK_QA_CONTROL_ROOT: rootDir,
  INTERDOMESTIK_QA_CONTROL_TEST_MODE: '1',
  NODE_ENV: 'test',
};

function runTypeScript(source) {
  return execFileSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', source],
    { cwd: rootDir, encoding: 'utf8', env: controlTestEnv }
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
  assert.equal(result.structuredContent.serverSourceRoot, fs.realpathSync.native(rootDir));
  assert.equal(result.structuredContent.targetRepoRoot, fs.realpathSync.native(rootDir));
  assert.match(result.structuredContent.serverSourceHead, /^[a-f0-9]{40}$/);
  assert.equal(result.structuredContent.targetHead, result.structuredContent.serverSourceHead);
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
  assert.match(source, /spawn\(process\.execPath, \['--import', 'tsx'/);
  assert.doesNotMatch(source, /spawn\('pnpm'/);
  assert.match(source, /await main\(\)/);
});

test('canonical MCP CLI injects its worktree root and rejects hidden tools', () => {
  const success = spawnSync(
    process.execPath,
    ['scripts/mcp-tool.mjs', 'call', 'git_status_compact', '{}'],
    { cwd: rootDir, encoding: 'utf8', env: controlTestEnv, timeout: 30000 }
  );
  assert.equal(success.status, 0, success.stderr);
  assert.doesNotMatch(success.stdout, /repoRoot is required/);
  const identity = JSON.parse(success.stdout).structuredContent;
  assert.equal(identity.serverSourceRoot, fs.realpathSync.native(rootDir));
  assert.equal(identity.targetRepoRoot, fs.realpathSync.native(rootDir));
  assert.match(identity.serverSourceHead, /^[a-f0-9]{40}$/);
  assert.equal(identity.targetHead, identity.serverSourceHead);

  const hidden = spawnSync(
    process.execPath,
    ['scripts/mcp-tool.mjs', 'call', 'audit_supabase', '{}', '--text'],
    { cwd: rootDir, encoding: 'utf8', env: controlTestEnv, timeout: 30000 }
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

test('unknown tool errors retain the selected source and target identities', () => {
  const result = JSON.parse(
    runTypeScript(`
      import { handleToolCall } from './packages/qa/src/tool-router.ts';
      console.log(JSON.stringify(await handleToolCall('__unknown_tool__', {
        repoRoot: ${JSON.stringify(rootDir)}
      })));
    `)
  );
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Tool __unknown_tool__ not found/);
  assert.equal(result.structuredContent.serverSourceRoot, fs.realpathSync.native(rootDir));
  assert.equal(result.structuredContent.targetRepoRoot, fs.realpathSync.native(rootDir));
  assert.equal(result.structuredContent.targetHead, result.structuredContent.serverSourceHead);
});

test('source attestation failures remain structured with observed identity', () => {
  const result = JSON.parse(
    runTypeScript(`
      process.env.MCP_SERVER_NAME = 'interdomestik_qa';
      process.env.MCP_SERVER_SOURCE_HEAD = '0'.repeat(40);
      const { handleToolCall } = await import('./packages/qa/src/tool-router.ts');
      console.log(JSON.stringify(await handleToolCall('git_status_compact', {
        repoRoot: ${JSON.stringify(rootDir)}
      })));
    `)
  );
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /launcher attestation/);
  assert.equal(result.structuredContent.serverSourceRoot, fs.realpathSync.native(rootDir));
  assert.match(result.structuredContent.serverSourceHead, /^[a-f0-9]{40}$/);
  assert.equal(result.structuredContent.targetRepoRoot, null);
  assert.equal(result.structuredContent.targetHead, null);
  assert.equal(result.structuredContent.targetBranch, null);
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
  const source = `process.env.NODE_OPTIONS = '--definitely-invalid-node-option';
    await import('./packages/qa/test-tools.ts');`;
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', source],
    {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: 5000,
    }
  );
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /server exited before responding.*code=9/);
  assert.doesNotMatch(result.stderr, /write EPIPE|Unhandled 'error'/);
});
