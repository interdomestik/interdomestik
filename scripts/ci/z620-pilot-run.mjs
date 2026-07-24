#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Z620_EXECUTABLES } from './managed-executables.mjs';
import { safeId } from './z620-runner-lib.mjs';
import { evidenceDirectoryForRunId, prepareEvidenceSubdirectory } from './z620-resource-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.PW_PORT);
if (!Number.isInteger(port) || port < 3100 || port > 3199) {
  throw new Error('Pilot gate requires a task-owned PW_PORT in 3100-3199');
}
if (!process.env.E2E_DATABASE_URL || !process.env.INTERDOMESTIK_TASK_OWNS_PORT) {
  throw new Error('Pilot gate requires task-owned database and port markers');
}

const baseUrl = `http://127.0.0.1:${port}`;
const runEnv = {
  ...process.env,
  CI: 'true',
  PORT: String(port),
  HOSTNAME: '127.0.0.1',
  NEXT_PUBLIC_APP_URL: baseUrl,
  BETTER_AUTH_URL: baseUrl,
  PLAYWRIGHT: '1',
};
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-pilot-'));
const serverLogPath = path.join(tempRoot, 'server.log');
const evidenceRunId = process.env.Z620_EVIDENCE_RUN_ID
  ? safeId(process.env.Z620_EVIDENCE_RUN_ID, 'evidence run id')
  : null;
const reportDir = evidenceRunId
  ? prepareEvidenceSubdirectory(
      evidenceDirectoryForRunId(evidenceRunId, root),
      'pilot-reports',
      root,
      undefined,
      { fresh: true }
    )
  : path.join(tempRoot, 'pilot-reports');
if (!evidenceRunId) fs.mkdirSync(reportDir, { mode: 0o700 });
let server;

function runPnpm(args) {
  const result = spawnSync(Z620_EXECUTABLES.pnpm, args, {
    cwd: root,
    env: runEnv,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(' ')} failed with ${result.status ?? 1}`);
  }
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (server.exitCode !== null) throw new Error('Pilot web server exited before health check');
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Pilot web server did not become healthy on ${baseUrl}`);
}

function stopServer() {
  if (server?.exitCode !== null) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    // The task-owned process group already exited.
  }
}

try {
  runPnpm(['db:migrate']);
  runPnpm(['seed:e2e']);
  runPnpm(['seed:assert-e2e']);
  runPnpm(['--filter', '@interdomestik/web', 'run', 'build:ci']);

  const serverLog = fs.openSync(serverLogPath, 'a', 0o600);
  server = spawn(Z620_EXECUTABLES.bash, ['scripts/e2e-webserver.sh'], {
    cwd: root,
    detached: true,
    env: { ...runEnv, STANDALONE_AUTOREBUILD: 'false' },
    stdio: ['ignore', serverLog, serverLog],
  });
  fs.closeSync(serverLog);
  await waitForHealth();
  runPnpm(['-s', 'release:gate:p0:raw', '--baseUrl', baseUrl, '--outDir', reportDir]);
} catch (error) {
  const serverLog = fs.existsSync(serverLogPath) ? fs.readFileSync(serverLogPath, 'utf8') : '';
  if (serverLog) process.stderr.write(serverLog.slice(-20_000));
  throw error;
} finally {
  stopServer();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
