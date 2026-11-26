import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contractBash } from './verification-evidence/worker-profile.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');
const gateScriptPath = path.join(rootDir, 'scripts/sonar-check-run-gate.sh');
const bashBinaryPath = contractBash();

function sanitizeEndpoint(endpoint) {
  return endpoint.replaceAll(/[^A-Za-z0-9._-]+/g, '_');
}

export function writeGhResponse(responsesDir, endpoint, payload) {
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

function createSonarApiHandler(responseByPath) {
  return (request, response) => {
    const payload = responseByPath[request.url];
    if (payload) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(payload));
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not found' }));
  };
}

export function startSonarApiServer(responseByPath) {
  return new Promise(resolve => {
    const server = http.createServer(createSonarApiHandler(responseByPath));

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        close: () => closeServer(server),
        origin: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

export function runGateScript(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(bashBinaryPath, [gateScriptPath], {
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

export const qualityGatePath =
  '/api/qualitygates/project_status?projectKey=interdomestik_interdomestik&pullRequest=307';
export const pullRequestsPath =
  '/api/project_pull_requests/list?project=interdomestik_interdomestik';
