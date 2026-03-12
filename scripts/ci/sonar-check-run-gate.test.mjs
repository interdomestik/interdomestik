import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');
const gateScriptPath = path.join(rootDir, 'scripts/sonar-check-run-gate.sh');

function sanitizeEndpoint(endpoint) {
  return endpoint.replaceAll(/[^A-Za-z0-9._-]+/g, '_');
}

function writeGhResponse(responsesDir, endpoint, payload) {
  const responsePath = path.join(responsesDir, `${sanitizeEndpoint(endpoint)}.json`);
  fs.writeFileSync(responsePath, JSON.stringify(payload));
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function createQualityGateHandler(responseBody) {
  const successPath =
    '/api/qualitygates/project_status?projectKey=interdomestik_interdomestik&pullRequest=307';

  return (request, response) => {
    if (request.url === successPath) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(responseBody));
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not found' }));
  };
}

function startQualityGateServer(responseBody) {
  return new Promise(resolve => {
    const server = http.createServer(createQualityGateHandler(responseBody));

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        close: () => closeServer(server),
        origin: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

function runGateScript(env) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [gateScriptPath], {
      cwd: rootDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', status => {
      resolve({
        status,
        stderr,
        stdout,
      });
    });
  });
}

test('sonar check-run gate accepts PR quality gate API results when the Sonar check suite is stuck queued without runs', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-check-run-gate-'));
  const binDir = path.join(tempRoot, 'bin');
  const responsesDir = path.join(tempRoot, 'responses');
  const evidenceDir = path.join(tempRoot, 'evidence');
  const eventPath = path.join(tempRoot, 'event.json');

  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(responsesDir, { recursive: true });
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 307 } }));

  const mockGhPath = path.join(binDir, 'gh');
  fs.writeFileSync(
    mockGhPath,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
if (args[0] !== 'api') {
  process.stderr.write('Unsupported gh command\\n');
  process.exit(2);
}

const endpoint = args.at(-1);
const responsePath = path.join(
  process.env.MOCK_GH_RESPONSES_DIR,
  endpoint.replace(/[^A-Za-z0-9._-]+/g, '_') + '.json'
);

if (!fs.existsSync(responsePath)) {
  process.stderr.write(\`Missing mock response for \${endpoint}\\n\`);
  process.exit(2);
}

process.stdout.write(fs.readFileSync(responsePath, 'utf8'));
`
  );
  fs.chmodSync(mockGhPath, 0o755);

  const checkRunsEndpoint =
    'repos/interdomestik/interdomestik/commits/test-sha/check-runs?filter=latest&per_page=100';
  const checkSuitesEndpoint =
    'repos/interdomestik/interdomestik/commits/test-sha/check-suites?filter=latest&per_page=100';
  const statusEndpoint = 'repos/interdomestik/interdomestik/commits/test-sha/status';

  writeGhResponse(responsesDir, checkRunsEndpoint, { check_runs: [] });
  writeGhResponse(responsesDir, checkSuitesEndpoint, {
    check_suites: [
      {
        app: {
          slug: 'sonarqubecloud',
          name: 'SonarQubeCloud',
        },
        status: 'queued',
        conclusion: null,
        latest_check_runs_count: 0,
        updated_at: '2026-03-12T14:39:12Z',
        created_at: '2026-03-12T14:39:04Z',
      },
    ],
  });
  writeGhResponse(responsesDir, statusEndpoint, { statuses: [] });

  const server = await startQualityGateServer({
    projectStatus: {
      status: 'OK',
    },
  });

  try {
    const result = await runGateScript({
      ...process.env,
      EVIDENCE_DIR: evidenceDir,
      GH_TOKEN: 'test-gh-token',
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: 'interdomestik/interdomestik',
      MOCK_GH_RESPONSES_DIR: responsesDir,
      PATH: `${binDir}:${process.env.PATH}`,
      SONAR_CHECK_MAX_RETRIES: '1',
      SONAR_CHECK_RETRY_DELAY_SECONDS: '0',
      SONAR_CHECK_SHA: 'test-sha',
      SONAR_HOST_URL: server.origin,
      SONAR_PROJECT_KEY: 'interdomestik_interdomestik',
      SONAR_TOKEN: 'test-sonar-token',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const summaryPath = path.join(evidenceDir, 'notes', 'sonar-summary.md');
    const summary = fs.readFileSync(summaryPath, 'utf8');
    assert.match(summary, /source: Sonar quality gate API/);
    assert.match(summary, /conclusion: OK/);
  } finally {
    await server.close();
  }
});
