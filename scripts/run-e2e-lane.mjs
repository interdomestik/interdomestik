#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultDbUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const secretPath = path.join(rootDir, 'apps/web/.playwright/better-auth-secret');

function loadLocalAuthSecret() {
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  let secret = fs.existsSync(secretPath) ? fs.readFileSync(secretPath, 'utf8').trim() : '';
  if (secret) return secret;
  secret = randomBytes(32).toString('base64url');
  fs.writeFileSync(secretPath, `${secret}\n`, { mode: 0o600 });
  return secret;
}

const reportArgs = ['--trace=retain-on-failure', '--reporter=line'];
const strictArgs = ['--max-failures=1', ...reportArgs];
const workerArgs = ['--workers=1', ...reportArgs];
const strictWorkerArgs = ['--workers=1', ...strictArgs];
const gateArgs = ['e2e/gate', ...strictWorkerArgs];
const pwCommandArgs = ['--filter', '@interdomestik/web', 'exec', 'playwright', 'test'];

const laneDefinitions = {
  state: {
    playwrightArgs: [
      'e2e/setup.state.spec.ts',
      '--project=setup-ks',
      '--project=setup-mk',
      ...strictWorkerArgs,
    ],
  },
  gate: {
    gatekeeper: true,
    state: true,
    env: { PW_FAST_GATES: '1' },
    playwrightArgs: [...gateArgs, '--project=gate-ks-sq', '--project=gate-mk-mk'],
  },
  pr: {
    gatekeeper: true,
    state: true,
    env: { PW_FAST_GATES: '1' },
    playwrightArgs: [...gateArgs, '--project=gate-ks-sq', '--project=gate-mk-contract'],
  },
  'gate-fast': {
    gatekeeper: true,
    env: { PW_FAST_GATES: '1' },
    playwrightArgs: [...gateArgs, '--project=gate-ks-sq', '--project=gate-mk-mk'],
  },
  'pr-fast': {
    gatekeeper: true,
    env: { PW_FAST_GATES: '1' },
    playwrightArgs: [...gateArgs, '--project=gate-ks-sq', '--project=gate-mk-contract'],
  },
  merge: {
    gatekeeper: true,
    playwrightArgs: [
      'e2e/gate',
      'e2e/golden',
      '--grep-invert',
      '@quarantine|@visual|@legacy',
      '--project=ks-sq',
      '--project=mk-mk',
      ...workerArgs,
    ],
  },
  'merge-fast': {
    gatekeeper: true,
    env: { PW_FAST_GATES: '1' },
    playwrightArgs: [
      'e2e/gate',
      'e2e/golden',
      '--grep-invert',
      '@quarantine|@visual|@legacy',
      '--project=gate-ks-sq',
      '--project=gate-mk-mk',
      ...workerArgs,
    ],
  },
  ks: {
    gatekeeper: true,
    playwrightArgs: ['e2e/gate', '--project=gate-ks-sq', ...strictArgs],
  },
  mk: {
    gatekeeper: true,
    playwrightArgs: ['e2e/gate', '--project=gate-mk-mk', ...strictArgs],
  },
  'ks-fast': {
    gatekeeper: true,
    env: { PW_FAST_GATES: '1' },
    playwrightArgs: ['e2e/gate', '--project=gate-ks-sq', ...strictArgs],
  },
  'mk-fast': {
    gatekeeper: true,
    env: { PW_FAST_GATES: '1' },
    playwrightArgs: ['e2e/gate', '--project=gate-mk-mk', ...strictArgs],
  },
  'front-door': {
    env: { PW_FRONT_DOOR: '1' },
    playwrightArgs: [
      'e2e/gate/front-door-session-context.spec.ts',
      '--project=front-door-ida-ks',
      '--project=front-door-ida-mk',
      ...strictWorkerArgs,
    ],
  },
};

function usage() {
  const lanes = Object.keys(laneDefinitions).join(', ');
  console.error(
    `Usage: node scripts/run-e2e-lane.mjs <lane> [playwright args...]\n\nLanes: ${lanes}`
  );
}

const laneName = process.argv[2] || 'gate';
const extraPlaywrightArgs = process.argv.slice(3);

if (laneName === '-h' || laneName === '--help' || laneName === 'help') {
  usage();
  process.exit(0);
}

const lane = laneDefinitions[laneName];

if (!lane) {
  usage();
  process.exit(2);
}

process.env.BETTER_AUTH_SECRET ||= loadLocalAuthSecret();
const baseEnv = {
  ...process.env,
  E2E_DATABASE_URL: process.env.E2E_DATABASE_URL || defaultDbUrl,
  E2E_DATABASE_URL_RLS:
    process.env.E2E_DATABASE_URL_RLS || process.env.E2E_DATABASE_URL || defaultDbUrl,
  NEXT_PUBLIC_BILLING_TEST_MODE: '1',
};
const laneEnv = lane.env ? { ...baseEnv, ...lane.env } : baseEnv;

function run(command, args, env = baseEnv) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (lane.gatekeeper) {
  run('bash', ['scripts/m4-gatekeeper.sh'], laneEnv);
}

if (lane.state) {
  run('pnpm', [...pwCommandArgs, ...laneDefinitions.state.playwrightArgs]);
}
run('pnpm', [...pwCommandArgs, ...lane.playwrightArgs, ...extraPlaywrightArgs], laneEnv);
