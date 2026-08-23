#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaControlRuntime } from './qa-mcp-control-runtime.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const requiredCodexServers = ['openai_docs', 'context7', 'playwright', 'interdomestik_qa'];
const requiredRepoQaTools = [
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
];
const controlRuntime = resolveQaControlRuntime();

function fail(message) {
  console.error(`Codex MCP preflight failed: ${message}`);
  console.error('');
  console.error('Recovery: restart Codex from this repository root and re-run pnpm mcp:preflight.');
  console.error(
    'If the running session still cannot see the interdomestik_qa callable tools, treat the MCP as blocked before using shell fallbacks.'
  );
  process.exit(1);
}

function runProcess(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? rootDir,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Timed out after ${timeoutMs}ms: ${command} ${args.join(' ')}`));
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `Command failed with exit ${code}: ${command} ${args.join(' ')}\n${stderr || stdout}`
        )
      );
    });
  });
}

async function readCodexMcpServers() {
  try {
    const { stdout } = await runProcess('codex', ['mcp', 'list', '--json']);
    const servers = JSON.parse(stdout);
    if (!Array.isArray(servers)) {
      fail('codex mcp list --json did not return an array.');
    }

    for (const server of servers) {
      if (!server || typeof server.name !== 'string') {
        fail('codex mcp list --json returned a server entry without a string name.');
      }
    }

    return servers;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      fail('codex CLI is not available on PATH.');
    }
    fail('codex mcp list --json did not return the configured server surface.');
  }
}

async function readCodexMcpServer(serverName) {
  try {
    const { stdout } = await runProcess('codex', ['mcp', 'get', serverName, '--json']);
    return JSON.parse(stdout);
  } catch {
    fail(`codex mcp get ${serverName} --json failed.`);
  }
}

function verifyConfigToml() {
  const configPath = path.join(rootDir, '.codex/config.toml');
  if (!fs.existsSync(configPath)) {
    fail(`missing ${configPath}`);
  }

  const configToml = fs.readFileSync(configPath, 'utf8');
  for (const serverName of requiredCodexServers) {
    if (!configToml.includes(`[mcp_servers.${serverName}]`)) {
      fail(`.codex/config.toml does not register mcp_servers.${serverName}`);
    }
  }

  for (const toolName of requiredRepoQaTools) {
    if (!configToml.includes(toolName)) {
      fail(`interdomestik_qa MCP_ENABLED_TOOLS must include ${toolName}`);
    }
  }
}

function verifyRequiredCodexCliServers(servers) {
  if (!Array.isArray(servers)) {
    fail('Codex MCP server list must be an array.');
  }

  const byName = new Map(servers.map(server => [server.name, server]));

  for (const serverName of requiredCodexServers) {
    const server = byName.get(serverName);
    if (!server) {
      fail(`codex mcp list --json does not include ${serverName}`);
    }
    if (server.enabled !== true) {
      fail(`Codex MCP server ${serverName} is not enabled.`);
    }
  }

  return byName;
}

function verifyRepoQaTransport(qaServer) {
  if (qaServer.transport?.type !== 'stdio') {
    fail('interdomestik_qa must be a stdio MCP server.');
  }
  if (qaServer.transport?.command !== '/bin/bash') {
    fail('interdomestik_qa must launch with /bin/bash.');
  }
  const qaArgs = qaServer.transport?.args ?? [];
  const expectedAbsoluteLauncher = path.join(controlRuntime.root, 'scripts/start-repo-qa.sh');
  if (!qaArgs.includes(expectedAbsoluteLauncher)) {
    fail('interdomestik_qa must use scripts/start-repo-qa.sh in Codex MCP registration.');
  }

  const qaCwd = qaServer.transport?.cwd;
  if (qaCwd !== controlRuntime.root) {
    fail('interdomestik_qa cwd must equal the attested control root.');
  }
}

function verifyRepoQaEnabledTools(qaServerDetails) {
  if (typeof qaServerDetails.transport?.env?.MCP_ENABLED_TOOLS !== 'string') {
    fail('interdomestik_qa must expose an MCP_ENABLED_TOOLS allowlist.');
  }

  for (const toolName of requiredRepoQaTools) {
    if (!qaServerDetails.transport.env.MCP_ENABLED_TOOLS.includes(toolName)) {
      fail(`interdomestik_qa MCP_ENABLED_TOOLS must include ${toolName}.`);
    }
  }
}

function verifyCodexCliServers(servers, qaServerDetails) {
  const byName = verifyRequiredCodexCliServers(servers);
  verifyRepoQaTransport(byName.get('interdomestik_qa'));
  verifyRepoQaEnabledTools(qaServerDetails);
}

async function verifyRepoQaLiveTools() {
  try {
    await runProcess(
      process.execPath,
      ['--test', 'scripts/ci/qa-mcp-discovery-contracts.test.mjs'],
      {
        timeoutMs: 30000,
      }
    );
  } catch {
    fail('live interdomestik_qa tools/list discovery contract failed.');
  }
}

async function main() {
  verifyConfigToml();
  const codexServers = await readCodexMcpServers();
  const repoQaServer = await readCodexMcpServer('interdomestik_qa');
  verifyCodexCliServers(codexServers, repoQaServer);
  await verifyRepoQaLiveTools();

  console.log('Codex MCP preflight passed.');
  console.log(`Configured Codex MCP servers: ${requiredCodexServers.join(', ')}`);
  console.log('Live interdomestik_qa discovery contract passed.');
  console.log(
    'If a running Codex session does not expose interdomestik_qa callable tools after this passes, restart Codex from the repo root before proceeding.'
  );
}

try {
  await main();
} catch {
  fail('unexpected preflight error.');
}
