#!/usr/bin/env node
/*
Runs Playwright e2e specs one-by-one (sequentially) and stops at the first failure.

Fast path (recommended):
  1) Start the Next dev server yourself: pnpm dev
  2) Run this script (it will not restart the server):
     PLAYWRIGHT_EXTERNAL_SERVER=1 PLAYWRIGHT_SKIP_SEED=1 node scripts/run-e2e-one-by-one.mjs

Notes:
- Ensures the setup project runs first (generates storageState if missing).
- Uses 1 worker so ordering is deterministic and output is easy to follow.
*/

import { spawnSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const e2eDir = path.join(cwd, 'e2e');

const PORT = 3000;
const HOST = process.env.PLAYWRIGHT_HOST ?? 'localhost';
const BASE_URL = `http://${HOST}:${PORT}`;

function run(cmd, args, env) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  return result.status ?? 1;
}

async function isServerUp(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok || (res.status >= 300 && res.status < 500);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForServer(url, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerUp(url)) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

function listSpecFiles() {
  const entries = fs.readdirSync(e2eDir, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.spec.ts'))
    .map(e => e.name)
    .filter(name => name !== 'setup.state.spec.ts')
    .sort((a, b) => a.localeCompare(b));
}

// Keep these defaults small and deterministic.
const baseEnv = {
  PLAYWRIGHT_SKIP_SEED: process.env.PLAYWRIGHT_SKIP_SEED ?? '1',
  // We always run against a single server instance.
  PLAYWRIGHT_EXTERNAL_SERVER: '1',
};

// 0) Ensure Next server is running (either externally, or we manage it).
let serverProcess = null;
{
  const alreadyUp = await isServerUp(BASE_URL);
  const manageServer = process.env.PLAYWRIGHT_MANAGE_SERVER !== '0';
  if (!alreadyUp) {
    if (!manageServer) {
      process.stderr.write(
        `\n❌ Next server is not reachable at ${BASE_URL}.\n` +
          `Start it with: pnpm dev (in apps/web), then rerun.\n\n`
      );
      process.exit(2);
    }

    process.stdout.write(`\nStarting Next dev server at ${BASE_URL}...\n`);
    serverProcess = spawn(
      'pnpm',
      ['exec', 'next', 'dev', '--turbopack', '--hostname', HOST, '--port', String(PORT)],
      {
        cwd,
        stdio: 'inherit',
        env: {
          ...process.env,
          NEXT_PUBLIC_APP_URL: BASE_URL,
          BETTER_AUTH_URL: BASE_URL,
        },
      }
    );

    const ok = await waitForServer(BASE_URL, 180000);
    if (!ok) {
      process.stderr.write(`\n❌ Next server did not become ready at ${BASE_URL}.\n`);
      try {
        serverProcess.kill('SIGTERM');
      } catch {
        // ignore
      }
      process.exit(3);
    }
  }
}

// 1) Run setup project first (storageState generation is already idempotent).
{
  const status = run('pnpm', [
    'exec',
    'playwright',
    'test',
    '--project=setup',
    '--workers=1',
    '--reporter=line',
  ], baseEnv);
  if (status !== 0) process.exit(status);
}

// 2) Run each spec file sequentially.
const specs = listSpecFiles();
for (const spec of specs) {
  process.stdout.write(`\n===== Running ${spec} =====\n`);
  const status = run(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      path.join('e2e', spec),
      '--project=chromium',
      '--workers=1',
      '--max-failures=1',
      '--reporter=line',
    ],
    baseEnv
  );
  if (status !== 0) {
    process.stderr.write(`\n❌ Failed in ${spec}. Stopping.\n`);
    if (serverProcess) {
      try {
        serverProcess.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    process.exit(status);
  }
}

if (serverProcess) {
  try {
    serverProcess.kill('SIGTERM');
  } catch {
    // ignore
  }
}

process.stdout.write(`\n✅ All e2e specs passed (one-by-one).\n`);
