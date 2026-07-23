#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  createTaskDatabase,
  databaseUrl,
  dropTaskDatabase,
  reserveE2ePort,
  taskDatabaseName,
} from './z620-resource-lib.mjs';

const separator = process.argv.indexOf('--');
if (separator < 0 || separator === process.argv.length - 1) {
  throw new Error('Usage: z620-resource-run.mjs [options] -- command [args...]');
}
const options = Object.fromEntries(
  process.argv.slice(2, separator).map(argument => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=') || true];
  })
);
const command = process.argv[separator + 1];
const commandArgs = process.argv.slice(separator + 2);
const sha = String(
  options.sha || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
);
const lane = String(options.lane || 'e2e');
const attempt = String(options.attempt || 'r1');
const stateRoot = path.resolve(
  String(options['state-root'] || '/home/arben/ci/interdomestik/state')
);
const database = taskDatabaseName(sha, lane, attempt);
const reservation = await reserveE2ePort(stateRoot, `${database}:${process.pid}`);
const databaseConnection = databaseUrl(database);
let created = false;
let forgejoFailures = 0;

async function checkForgejo() {
  try {
    const response = await fetch('http://127.0.0.1:3000/', { signal: AbortSignal.timeout(2000) });
    if (!response.ok) forgejoFailures += 1;
  } catch {
    forgejoFailures += 1;
  }
}

try {
  createTaskDatabase(database);
  created = true;
  await checkForgejo();
  const child = spawn(command, commandArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseConnection,
      DATABASE_URL_RLS: databaseConnection,
      E2E_DATABASE_URL: databaseConnection,
      E2E_DATABASE_URL_RLS: databaseConnection,
      PW_PORT: String(reservation.port),
      INTERDOMESTIK_TASK_OWNS_PORT: '1',
      SKIP_DOCKER_DOCTOR: '1',
      BILLING_TEST_MODE: '1',
      NEXT_PUBLIC_BILLING_TEST_MODE: '1',
    },
  });
  const monitor = setInterval(checkForgejo, 2000);
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  clearInterval(monitor);
  await checkForgejo();
  console.log(
    JSON.stringify({
      status: exitCode === 0 && forgejoFailures === 0 ? 'pass' : 'fail',
      database,
      port: reservation.port,
      commandExitCode: exitCode,
      forgejoFailures,
    })
  );
  if (exitCode !== 0 || forgejoFailures !== 0) process.exitCode = exitCode || 1;
} finally {
  if (created) dropTaskDatabase(database);
  reservation.release();
}
