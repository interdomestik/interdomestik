import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const timeoutMs = 30000;
const head = root =>
  execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const currentBranch = root =>
  execFileSync('git', ['-C', root, 'branch', '--show-current'], { encoding: 'utf8' }).trim() ||
  null;
function assertIdentity(result, targetRoot, branch = currentBranch(targetRoot)) {
  assert.equal(result.structuredContent.serverSourceRoot, rootDir);
  assert.equal(result.structuredContent.serverSourceHead, head(rootDir));
  assert.equal(result.structuredContent.targetRepoRoot, fs.realpathSync.native(targetRoot));
  assert.equal(result.structuredContent.targetHead, head(targetRoot));
  assert.equal(result.structuredContent.targetBranch, branch);
  assert.equal(result.structuredContent.repoRootSource, 'tool-argument');
}
async function createClient() {
  const child = spawn('/bin/bash', ['scripts/start-repo-qa.sh'], {
    cwd: rootDir,
    detached: true,
    env: {
      ...process.env,
      INTERDOMESTIK_QA_CONTROL_ROOT: rootDir,
      INTERDOMESTIK_QA_CONTROL_TEST_MODE: '1',
      MCP_REPO_ROOT: rootDir,
      NODE_ENV: 'test',
    },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const pending = new Map();
  let buffer = '';
  let nextId = 1;
  child.stdout.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const response = JSON.parse(line);
      const request = pending.get(response.id);
      if (!request) continue;
      clearTimeout(request.timer);
      pending.delete(response.id);
      request.resolve(response);
    }
  });
  function request(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP response timeout for ${method}`));
      }, timeoutMs);
      pending.set(id, { reject, resolve, timer });
      child.stdin.write(`${JSON.stringify({ id, jsonrpc: '2.0', method, params })}\n`);
    });
  }
  await request('initialize', {
    capabilities: {},
    clientInfo: { name: 'qa-mcp-worktree-contract', version: '1.0.0' },
    protocolVersion: '2024-11-05',
  });
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`
  );
  return {
    call: (name, args = {}) =>
      request('tools/call', { arguments: args, name }).then(response => response.result),
    close: () => {
      if (child.pid && child.exitCode === null) process.kill(-child.pid, 'SIGTERM');
    },
    tools: () => request('tools/list').then(response => response.result.tools),
  };
}
test('repo-bound MCP tools require an explicit validated worktree root', async () => {
  const client = await createClient();
  try {
    const tools = await client.tools();
    for (const name of [
      'project_map',
      'read_files',
      'read_file_range',
      'code_search',
      'git_status_compact',
      'git_branch_info',
      'changed_files',
      'scope_audit',
      'check_health',
      'pr_verify',
      'security_guard',
      'e2e_gate',
    ]) {
      const schema = tools.find(tool => tool.name === name)?.inputSchema;
      assert.ok(schema?.required?.includes('repoRoot'), `${name} must require repoRoot`);
    }
    const missing = await client.call('git_status_compact');
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /repoRoot is required/);
    assert.equal(missing.structuredContent.targetRepoRoot, null);
    assert.equal(missing.structuredContent.targetHead, null);
    assert.equal(missing.structuredContent.targetBranch, null);
    assert.equal(missing.structuredContent.serverSourceRoot, rootDir);
    assert.equal(missing.structuredContent.serverSourceHead, head(rootDir));
    const selected = await client.call('git_status_compact', { repoRoot: rootDir });
    assert.equal(selected.structuredContent.repoRoot, rootDir);
    assertIdentity(selected, rootDir);
    const sibling = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-mcp-worktree-'));
    try {
      execFileSync('git', ['worktree', 'add', '--detach', sibling, 'HEAD'], { cwd: rootDir });
      const [currentResult, siblingResult] = await Promise.all([
        client.call('git_status_compact', { repoRoot: rootDir }),
        client.call('git_status_compact', { repoRoot: sibling }),
      ]);
      assert.equal(currentResult.structuredContent.repoRoot, rootDir);
      assert.equal(siblingResult.structuredContent.repoRoot, fs.realpathSync.native(sibling));
      assertIdentity(currentResult, rootDir);
      assertIdentity(siblingResult, sibling);
      const currentAgain = await client.call('git_status_compact', { repoRoot: rootDir });
      assertIdentity(currentAgain, rootDir);
      fs.symlinkSync(os.tmpdir(), path.join(sibling, 'qa-mcp-external-link'));
      const escaped = await client.call('read_files', {
        files: ['qa-mcp-external-link/secret.txt'],
        repoRoot: sibling,
      });
      assert.equal(escaped.isError, true);
      assert.equal(escaped.structuredContent.status, 'error');
      assert.equal(escaped.structuredContent.repoRoot, fs.realpathSync.native(sibling));
      assert.match(escaped.content[0].text, /Path escapes repository root/);
      const rejectedRange = await client.call('read_file_range', {
        file: '/etc/passwd',
        repoRoot: sibling,
      });
      assert.equal(rejectedRange.isError, true);
      assert.equal(rejectedRange.structuredContent.repoRoot, fs.realpathSync.native(sibling));
      assertIdentity(rejectedRange, sibling);
      const executed = await client.call('security_guard', { repoRoot: sibling });
      assert.equal(executed.structuredContent.cwd, fs.realpathSync.native(sibling));
      assert.equal(executed.structuredContent.repoRoot, fs.realpathSync.native(sibling));
      assertIdentity(executed, sibling);
    } finally {
      execFileSync('git', ['worktree', 'remove', '--force', sibling], { cwd: rootDir });
    }
    const foreign = await client.call('git_status_compact', { repoRoot: '/tmp' });
    assert.equal(foreign.isError, true);
    assert.match(foreign.content[0].text, /registered worktree/);
    assert.equal(foreign.structuredContent.targetRepoRoot, null);
    const relative = await client.call('git_status_compact', { repoRoot: '.' });
    assert.match(relative.content[0].text, /absolute worktree root/);
    const subdirectory = await client.call('git_status_compact', {
      repoRoot: path.join(rootDir, 'apps'),
    });
    assert.match(subdirectory.content[0].text, /registered worktree/);
    const counterfeit = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-mcp-counterfeit-'));
    try {
      const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
        cwd: rootDir,
        encoding: 'utf8',
      }).trim();
      for (const marker of ['turbo.json', 'pnpm-workspace.yaml'])
        fs.writeFileSync(path.join(counterfeit, marker), '');
      fs.writeFileSync(path.join(counterfeit, '.git'), `gitdir: ${common}\n`);
      const forged = await client.call('git_status_compact', { repoRoot: counterfeit });
      assert.match(forged.content[0].text, /registered worktree/);
    } finally {
      fs.rmSync(counterfeit, { recursive: true });
    }
    const source = fs.readFileSync(path.join(rootDir, 'packages/qa/src/tool-router.ts'), 'utf8');
    assert.doesNotMatch(source, /setRoot|process\.chdir/);
  } finally {
    client.close();
  }
});
