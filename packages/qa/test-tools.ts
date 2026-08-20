import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type RpcResponse = {
  error?: unknown;
  id?: number;
  result?: { isError?: boolean };
};

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(packageDir, '..', '..');
const server = spawn(process.execPath, ['--import', 'tsx', path.join(packageDir, 'src/index.ts')], {
  cwd: REPO_ROOT,
  env: { ...process.env, MCP_REPO_ROOT: REPO_ROOT, MCP_SERVER_NAME: 'interdomestik-qa' },
  stdio: ['pipe', 'pipe', 'inherit'],
});
const pending = new Map<
  number,
  {
    reject: (error: Error) => void;
    resolve: (response: RpcResponse) => void;
    timer: NodeJS.Timeout;
  }
>();
let buffer = '';
let nextId = 1;

function rejectPending(error: Error) {
  for (const active of pending.values()) {
    clearTimeout(active.timer);
    active.reject(error);
  }
  pending.clear();
}

server.once('error', error => rejectPending(error));
server.once('exit', (code, signal) => {
  if (pending.size === 0) return;
  rejectPending(
    new Error(
      `QA MCP server exited before responding (code=${code ?? 'null'}, signal=${signal ?? 'none'})`
    )
  );
});

server.stdout.on('data', chunk => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    let response: RpcResponse;
    try {
      response = JSON.parse(line) as RpcResponse;
    } catch {
      console.error('QA MCP emitted non-JSON stdout');
      process.exitCode = 1;
      continue;
    }
    if (typeof response.id !== 'number') continue;
    const active = pending.get(response.id);
    if (!active) continue;
    clearTimeout(active.timer);
    pending.delete(response.id);
    active.resolve(response);
  }
});

function request(method: string, params: unknown, timeoutMs = 15 * 60 * 1000) {
  const id = nextId++;
  return new Promise<RpcResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP response timeout for ${method}`));
    }, timeoutMs);
    pending.set(id, { reject, resolve, timer });
    server.stdin.write(`${JSON.stringify({ id, jsonrpc: '2.0', method, params })}\n`);
  });
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
  console.log(`\n--- ${name} ---`);
  const response = await request('tools/call', {
    arguments: { ...args, repoRoot: REPO_ROOT },
    name,
  });
  if (response.error || !response.result || response.result.isError === true) {
    throw new Error(`${name} returned a JSON-RPC or tool error`);
  }
}

async function main() {
  const initialized = await request('initialize', {
    capabilities: {},
    clientInfo: { name: 'qa-cli-check', version: '1.0.0' },
    protocolVersion: '2024-11-05',
  });
  if (initialized.error) throw new Error('QA MCP initialization failed');
  server.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`
  );

  await callTool('run_unit_tests');
  await callTool('query_db', { text: "SELECT 'connected' as status" });
  await callTool('git_status');
  await callTool('read_files', { files: ['package.json'] });

  const paddleId = process.env.QA_PADDLE_SUBSCRIPTION_ID || process.env.PADDLE_TEST_SUBSCRIPTION_ID;
  if (paddleId) {
    await callTool('get_paddle_resource', { id: paddleId, resource: 'subscriptions' });
  } else {
    console.log('\n--- get_paddle_resource skipped: configure a test subscription ID ---');
  }
  if (process.env.QA_RUN_E2E === 'true') {
    await callTool('run_e2e_tests');
  } else {
    console.log('\n--- run_e2e_tests skipped: set QA_RUN_E2E=true ---');
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  rejectPending(new Error('QA MCP client stopped'));
  if (server.exitCode === null) server.kill('SIGTERM');
}
