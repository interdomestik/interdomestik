import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

async function createMcpClient() {
  const child = spawn('/bin/bash', ['scripts/start-repo-qa.sh'], {
    cwd: rootDir,
    detached: true,
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, MCP_REPO_ROOT: rootDir },
  });

  let stdout = '';
  let nextId = 1;
  const pending = new Map();

  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
    const lines = stdout.split('\n');
    stdout = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;

      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }

      const pendingRequest = pending.get(message.id);
      if (!pendingRequest) continue;

      clearTimeout(pendingRequest.timeout);
      pending.delete(message.id);
      pendingRequest.resolve(message);
    }
  });

  child.on('exit', code => {
    for (const [id, pendingRequest] of pending.entries()) {
      clearTimeout(pendingRequest.timeout);
      pending.delete(id);
      pendingRequest.reject(
        new Error(
          `QA MCP server exited before ${pendingRequest.label} completed (code=${code ?? 'null'})`
        )
      );
    }
  });

  async function request(method, params = {}) {
    const id = nextId;
    nextId += 1;
    const label =
      method === 'tools/call' && typeof params.name === 'string'
        ? `${method}:${params.name}`
        : method;

    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for MCP response ${id} (${label})`));
      }, 10000);

      pending.set(id, {
        label,
        reject,
        resolve,
        timeout,
      });

      child.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params,
        }) + '\n'
      );
    });

    return response;
  }

  async function close() {
    if (child.pid && child.exitCode === null && !child.killed) {
      await new Promise(resolve => {
        const forceKillTimer = setTimeout(() => {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            // Process group already exited.
          }
        }, 2000);

        child.once('close', () => {
          clearTimeout(forceKillTimer);
          resolve();
        });

        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          clearTimeout(forceKillTimer);
          resolve();
        }
      });
    }
  }

  await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'qa-mcp-contract', version: '1.0.0' },
  });
  child.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    }) + '\n'
  );

  return {
    callTool: (name, args = {}) =>
      request('tools/call', {
        arguments: args,
        name,
      }).then(response => response.result),
    close,
    listTools: () => request('tools/list').then(response => response.result.tools),
  };
}

async function listToolsViaMcp() {
  const client = await createMcpClient();

  try {
    return (await client.listTools()).map(tool => tool.name);
  } finally {
    await client.close();
  }
}

test('repo QA MCP launcher exposes the expected live tool surface over stdio', async () => {
  const toolNames = await listToolsViaMcp();

  for (const toolName of [
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
    assert.ok(toolNames.includes(toolName), `expected live QA tool ${toolName}`);
  }
});

test('repo QA MCP repo helpers return structured results for faster agent inspection', async () => {
  const client = await createMcpClient();

  try {
    const rangeResult = await client.callTool('read_file_range', {
      endLine: 12,
      file: 'packages/qa/src/tools/repo.ts',
      startLine: 1,
    });
    assert.equal(rangeResult.structuredContent.tool, 'read_file_range');
    assert.equal(rangeResult.structuredContent.status, 'ok');
    assert.match(rangeResult.content[0].text, /packages\/qa\/src\/tools\/repo\.ts:1-12/);

    const outOfBoundsResult = await client.callTool('read_file_range', {
      file: 'packages/qa/src/tools/repo.ts',
      startLine: 100000,
    });
    assert.equal(outOfBoundsResult.structuredContent.status, 'out_of_bounds');
    assert.equal(outOfBoundsResult.structuredContent.linesRead, 0);

    const projectMapResult = await client.callTool('project_map', { maxDepth: 1 });
    assert.equal(projectMapResult.structuredContent.tool, 'project_map');
    assert.equal(projectMapResult.structuredContent.repoRoot, rootDir);
    assert.equal(projectMapResult.structuredContent.repoRootSource, 'MCP_REPO_ROOT');

    const branchResult = await client.callTool('git_branch_info');
    assert.equal(branchResult.structuredContent.tool, 'git_branch_info');
    assert.equal(branchResult.structuredContent.repoRoot, rootDir);
    assert.equal(branchResult.structuredContent.repoRootSource, 'MCP_REPO_ROOT');
    assert.ok(branchResult.structuredContent.head);
    assert.ok(branchResult.content[0].text.includes(`repoRoot: ${rootDir}`));
    assert.match(branchResult.content[0].text, /repoRootSource: MCP_REPO_ROOT/);

    const statusResult = await client.callTool('git_status_compact');
    assert.equal(statusResult.structuredContent.tool, 'git_status_compact');
    assert.equal(statusResult.structuredContent.repoRoot, rootDir);
    assert.equal(statusResult.structuredContent.repoRootSource, 'MCP_REPO_ROOT');
    assert.equal(typeof statusResult.structuredContent.changedCount, 'number');
    assert.equal(typeof statusResult.structuredContent.isClean, 'boolean');
    assert.ok(statusResult.content[0].text.includes(`repoRoot: ${rootDir}`));
    assert.match(statusResult.content[0].text, /repoRootSource: MCP_REPO_ROOT/);

    const changedResult = await client.callTool('changed_files');
    assert.equal(changedResult.structuredContent.tool, 'changed_files');
    assert.ok(Array.isArray(changedResult.structuredContent.files));

    const scopeResult = await client.callTool('scope_audit', {
      forbiddenPaths: ['__qa_mcp_contract_forbidden_path__'],
    });
    assert.equal(scopeResult.structuredContent.tool, 'scope_audit');
    assert.equal(scopeResult.structuredContent.status, 'pass');
  } finally {
    await client.close();
  }
});
