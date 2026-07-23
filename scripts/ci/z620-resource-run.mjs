#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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
const authSecret = process.env.BETTER_AUTH_SECRET || randomBytes(32).toString('base64url');
const e2ePassword = randomBytes(24).toString('base64url');
const e2eApiSecret = randomBytes(32).toString('base64url');
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
      BETTER_AUTH_SECRET: authSecret,
      E2E_PASSWORD: e2ePassword,
      E2E_API_SECRET: e2eApiSecret,
      RELEASE_GATE_MEMBER_EMAIL: 'member.ks.a1@interdomestik.com',
      RELEASE_GATE_MEMBER_PASSWORD: e2ePassword,
      RELEASE_GATE_AGENT_EMAIL: 'agent.ks.a1@interdomestik.com',
      RELEASE_GATE_AGENT_PASSWORD: e2ePassword,
      RELEASE_GATE_OFFICE_AGENT_EMAIL: 'agent.ks.b1@interdomestik.com',
      RELEASE_GATE_STAFF_EMAIL: 'staff.ks@interdomestik.com',
      RELEASE_GATE_STAFF_PASSWORD: e2ePassword,
      RELEASE_GATE_ADMIN_KS_EMAIL: 'admin.ks@interdomestik.com',
      RELEASE_GATE_ADMIN_KS_PASSWORD: e2ePassword,
      RELEASE_GATE_ADMIN_MK_EMAIL: 'admin.mk@interdomestik.com',
      RELEASE_GATE_ADMIN_MK_PASSWORD: e2ePassword,
      UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:8080',
      UPSTASH_REDIS_REST_TOKEN: 'local-ci-placeholder',
      PLAYWRIGHT: '1',
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
