import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

async function listToolsViaMcp() {
  const child = spawn('/bin/bash', ['scripts/start-repo-qa.sh'], {
    cwd: rootDir,
    detached: true,
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, MCP_REPO_ROOT: rootDir },
  });

  let stdout = '';

  try {
    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for tools/list response'));
      }, 10000);

      child.stdout.on('data', chunk => {
        stdout += chunk.toString();

        for (const line of stdout.split('\n')) {
          if (!line.trim()) continue;

          let message;
          try {
            message = JSON.parse(line);
          } catch {
            continue;
          }

          if (message.id === 2) {
            clearTimeout(timeout);
            resolve(message);
            return;
          }
        }
      });

      child.on('exit', code => {
        clearTimeout(timeout);
        reject(new Error(`QA MCP server exited before tools/list completed (code=${code ?? 'null'})`));
      });

      child.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'qa-mcp-contract', version: '1.0.0' },
          },
        }) + '\n'
      );
      child.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {},
        }) + '\n'
      );
      child.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        }) + '\n'
      );
    });

    return response.result.tools.map(tool => tool.name);
  } finally {
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
}

test('repo QA MCP launcher exposes the expected live tool surface over stdio', async () => {
  const toolNames = await listToolsViaMcp();

  for (const toolName of [
    'project_map',
    'read_files',
    'code_search',
    'check_health',
    'pr_verify',
    'security_guard',
    'e2e_gate',
  ]) {
    assert.ok(toolNames.includes(toolName), `expected live QA tool ${toolName}`);
  }
});
