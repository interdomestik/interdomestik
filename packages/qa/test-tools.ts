import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverPath = path.resolve(__dirname, 'src/index.ts');
const server = spawn('npx', ['tsx', serverPath], {
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

  // Test Run: E2E Tests (Delayed to let Unit tests finish likely)
  setTimeout(() => {
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
