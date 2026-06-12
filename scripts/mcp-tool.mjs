#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const enabledTools =
  'project_map,read_files,read_file_range,code_search,git_status_compact,git_branch_info,changed_files,scope_audit,check_health,pr_verify,security_guard,e2e_gate';
const gitBin = '/usr/bin/git';

function usage() {
  console.error('Usage: node scripts/mcp-tool.mjs list [--names] | call <tool> <json> [--text]');
  process.exit(1);
}

function gitOutput(args) {
  const result = spawnSync(gitBin, args, { cwd: process.cwd(), encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function commonGitRoot() {
  const gitDir = gitOutput(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return gitDir?.endsWith(`${path.sep}.git`) ? path.dirname(gitDir) : null;
}

function dependencyRoot(repoRoot) {
  for (const candidate of [repoRoot, commonGitRoot()].filter(Boolean)) {
    if (fs.existsSync(path.join(candidate, 'node_modules/.bin/tsx'))) return candidate;
  }
  throw new Error('Cannot find node_modules/.bin/tsx in this worktree or common git root');
}

function startServer() {
  const repoRoot = gitOutput(['rev-parse', '--show-toplevel']) || process.cwd();
  const runtimeRoot = dependencyRoot(repoRoot);
  const tsx = path.join(runtimeRoot, 'node_modules/.bin/tsx');
  const entry = path.join(runtimeRoot, 'packages/qa/src/index.ts');
  return spawn(tsx, [entry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      MCP_ENABLED_TOOLS: enabledTools,
      MCP_REPO_ROOT: repoRoot,
      MCP_SERVER_NAME: 'interdomestik_qa',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function createClient() {
  const child = startServer();
  let id = 0;
  let buffer = '';
  let stderr = '';
  const pending = new Map();
  child.stdout.on('data', chunk => {
    buffer += chunk.toString();
    for (;;) {
      const index = buffer.indexOf('\n');
      if (index < 0) break;
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const request = pending.get(message.id);
      if (!request) continue;
      pending.delete(message.id);
      message.error
        ? request.reject(new Error(JSON.stringify(message.error)))
        : request.resolve(message);
    }
  });
  child.stderr.on('data', chunk => (stderr += chunk.toString()));
  child.on('exit', code => {
    for (const request of pending.values()) {
      const stderrMessage = stderr ? '\n' + stderr : '';
      request.reject(new Error(`MCP server exited ${code}${stderrMessage}`));
    }
    pending.clear();
  });
  const request = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`);
    });
  return {
    async init() {
      await request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'interdomestik-mcp-tool', version: '1.0.0' },
      });
      const initialized = { jsonrpc: '2.0', method: 'notifications/initialized', params: {} };
      child.stdin.write(`${JSON.stringify(initialized)}\n`);
    },
    close() {
      child.kill('SIGTERM');
    },
    request,
  };
}

function parseJson(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    throw new Error(`Invalid JSON arguments: ${value}`);
  }
}

function printResult(result, textOnly) {
  const text = (result.content || [])
    .map(entry => entry.text)
    .filter(Boolean)
    .join('\n');
  console.log(textOnly ? text : JSON.stringify(result, null, 2));
}

async function main() {
  const [command, nameOrFlag, jsonArg, maybeText] = process.argv.slice(2);
  if (!['list', 'call'].includes(command)) usage();
  const client = createClient();
  try {
    await client.init();
    if (command === 'list') {
      const response = await client.request('tools/list');
      const tools = response.result.tools || [];
      if (nameOrFlag === '--names') console.log(tools.map(tool => tool.name).join('\n'));
      else console.log(JSON.stringify(tools, null, 2));
      return;
    }
    if (!nameOrFlag) usage();
    const response = await client.request('tools/call', {
      name: nameOrFlag,
      arguments: parseJson(jsonArg),
    });
    printResult(response.result, maybeText === '--text');
  } finally {
    client.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
