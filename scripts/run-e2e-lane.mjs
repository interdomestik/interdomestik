#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultDbUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const localAuthSecretPath = path.join(rootDir, 'apps/web/.playwright/better-auth-secret');

function loadLocalBetterAuthSecret() {
  fs.mkdirSync(path.dirname(localAuthSecretPath), { recursive: true });
  const existingSecret = fs.existsSync(localAuthSecretPath)
    ? fs.readFileSync(localAuthSecretPath, 'utf8').trim()
    : '';
  if (existingSecret) return existingSecret;
  const generatedSecret = randomBytes(32).toString('base64url');
  fs.writeFileSync(localAuthSecretPath, `${generatedSecret}\n`, { mode: 0o600 });
  return generatedSecret;
}

const reportArgs = ['--trace=retain-on-failure', '--reporter=line'];
const strictArgs = ['--max-failures=1', ...reportArgs];
const singleWorkerArgs = ['--workers=1', ...reportArgs];
const strictSingleWorkerArgs = ['--workers=1', ...strictArgs];
const commonGateArgs = ['e2e/gate', ...strictSingleWorkerArgs];
const playwrightCommandArgs = ['--filter', '@interdomestik/web', 'exec', 'playwright', 'test'];

const laneDefinitions = {
  state: {
    playwrightArgs: [
      'e2e/setup.state.spec.ts',
      '--project=setup-ks',
      '--project=setup-mk',
      ...strictSingleWorkerArgs,
    ],
  },
  gate: {
    gatekeeper: true,
    state: true,
    env: { PW_FAST_GATES: '1' },
    playwrightArgs: [...commonGateArgs, '--project=gate-ks-sq', '--project=gate-mk-mk'],
  },
  pr: {
    gatekeeper: true,
    state: true,
    env: { PW_FAST_GATES: '1' },
    playwrightArgs: [...commonGateArgs, '--project=gate-ks-sq', '--project=gate-mk-contract'],
  },
  'gate-fast': {
    gatekeeper: true,
    env: { PW_FAST_GATES: '1' },
    playwrightArgs: [...commonGateArgs, '--project=gate-ks-sq', '--project=gate-mk-mk'],
  },
  'pr-fast': {
    gatekeeper: true,
    env: { PW_FAST_GATES: '1' },
    playwrightArgs: [...commonGateArgs, '--project=gate-ks-sq', '--project=gate-mk-contract'],
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
      ...singleWorkerArgs,
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
      ...singleWorkerArgs,
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
      ...strictSingleWorkerArgs,
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

process.env.BETTER_AUTH_SECRET ||= loadLocalBetterAuthSecret();
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
  run('pnpm', [...playwrightCommandArgs, ...laneDefinitions.state.playwrightArgs]);
}
run('pnpm', [...playwrightCommandArgs, ...lane.playwrightArgs, ...extraPlaywrightArgs], laneEnv);
