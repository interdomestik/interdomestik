import { spawn } from 'child_process';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(REPO_ROOT, '.env') });

const serverPath = path.resolve(__dirname, 'src/index.ts');
const server = spawn('npx', ['tsx', serverPath], {
  cwd: REPO_ROOT,
  env: {
    ...process.env,
    MCP_REPO_ROOT: REPO_ROOT,
    MCP_SERVER_NAME: 'interdomestik-qa',
  },
  stdio: ['pipe', 'pipe', 'inherit'],
});

let buffer = '';

server.stdout.on('data', data => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const response = JSON.parse(line);
      console.log('Received Response:', JSON.stringify(response, null, 2));

      // If we received a result for our requests, we can exit or continue
      if (response.result || response.error) {
        // Just log it
      }
    } catch (e) {
      console.log('Server Output (Non-JSON):', line);
    }
  }
});

function sendRequest(method: string, params: any, id: number) {
  const request = {
    jsonrpc: '2.0',
    method,
    params,
    id,
  };
  console.log(`Sending ${method}...`);
  server.stdin.write(JSON.stringify(request) + '\n');
}

// 1. Initialize
sendRequest(
  'initialize',
  {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0' },
  },
  1
);

// Wait a bit then call tools
setTimeout(() => {
  // Test Run: Unit Tests
  console.log('\n--- STARTING UNIT TESTS via MCP ---\n');
  sendRequest(
    'tools/call',
    {
      name: 'run_unit_tests',
      arguments: {},
    },
    100
  );

  // Test Run: Database (Fast check)
  setTimeout(() => {
    console.log('\n--- TESTING DATABASE via MCP ---\n');
    sendRequest(
      'tools/call',
      {
        name: 'query_db',
        arguments: { text: "SELECT 'connected' as status" },
      },
      102
    );
  }, 500);

  // Test Run: Paddle (Fast check) - optional
  setTimeout(() => {
    const paddleSubscription =
      process.env.QA_PADDLE_SUBSCRIPTION_ID || process.env.PADDLE_TEST_SUBSCRIPTION_ID;
    if (!paddleSubscription) {
      console.log('\n--- TESTING PADDLE via MCP (skipped: set QA_PADDLE_SUBSCRIPTION_ID) ---\n');
      return;
    }
    console.log('\n--- TESTING PADDLE via MCP ---\n');
    sendRequest(
      'tools/call',
      {
        name: 'get_paddle_resource',
        arguments: { resource: 'subscriptions', id: paddleSubscription },
      },
      103
    );
  }, 1000);

  // Test Run: Context Tools (Fast check)
  setTimeout(() => {
    console.log('\n--- TESTING CONTEXT TOOLS via MCP ---\n');
    sendRequest('tools/call', { name: 'git_status', arguments: {} }, 104);
    sendRequest('tools/call', { name: 'read_files', arguments: { files: ['package.json'] } }, 105);
  }, 1500);

  // Test Run: E2E Tests (Delayed to let Unit tests finish likely) - optional
  setTimeout(() => {
    if (process.env.QA_SKIP_E2E === 'true') {
      console.log('\n--- STARTING E2E TESTS via MCP (skipped: QA_SKIP_E2E=true) ---\n');
      return;
    }
    const shouldRunE2E = process.env.QA_RUN_E2E === 'true';
    if (!shouldRunE2E) {
      console.log('\n--- STARTING E2E TESTS via MCP (skipped: set QA_RUN_E2E=true to run) ---\n');
      return;
    }
    console.log('\n--- STARTING E2E TESTS via MCP ---\n');
    sendRequest(
      'tools/call',
      {
        name: 'run_e2e_tests',
        arguments: {},
      },
      101
    );
  }, 5000); // Wait 5s before starting E2e
}, 1000);

// End of test sequence
// We handle the calls in the previous block

// Exit after 45 seconds (E2E tests take time)
setTimeout(() => {
  console.log('\n--- TIMEOUT REACHED ---\n');
  server.kill();
  process.exit(0);
}, 45000);
