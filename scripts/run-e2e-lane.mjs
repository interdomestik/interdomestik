#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const secretPath = path.join(rootDir, 'apps/web/.playwright/better-auth-secret');

function readSecret() {
  try {
    return fs.readFileSync(secretPath, 'utf8').trim() || null;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function assertSecret(secret, source) {
  if (!secret || secret.length < 32) throw new Error(`Invalid BETTER_AUTH_SECRET from ${source}`);
  return secret;
}

function loadSecret() {
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  const secret = readSecret();
  if (secret) return assertSecret(secret, secretPath);
  const next = randomBytes(32).toString('base64url');
  try {
    fs.writeFileSync(secretPath, `${next}\n`, { flag: 'wx', mode: 0o600 });
    return next;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    return assertSecret(readSecret(), secretPath);
  }
}
const reportArgs = ['--trace=retain-on-failure', '--reporter=line'];
const strictArgs = ['--max-failures=1', ...reportArgs];
const workerArgs = ['--workers=1', ...reportArgs];
const strictWorkers = ['--workers=1', ...strictArgs];
const gateArgs = ['e2e/gate', ...strictWorkers];
const setupArgs = ['e2e/setup.state.spec.ts', '--project=setup-ks', '--project=setup-mk'];
const mergeArgs = ['e2e/gate', 'e2e/golden', '--grep-invert', '@quarantine|@visual|@legacy'];
const pwArgs = ['--filter', '@interdomestik/web', 'exec', 'playwright', 'test'];
const fastEnv = { PW_FAST_GATES: '1' };
const ksSq = '--project=gate-ks-sq';
const mkMk = '--project=gate-mk-mk';
const mkContract = '--project=gate-mk-contract';
const gateLane = (projects, state = false) => ({
  gatekeeper: true,
  state,
  env: fastEnv,
  playwrightArgs: [...gateArgs, ...projects],
});
const projectLane = (project, env) => ({
  gatekeeper: true,
  ...(env && { env }),
  playwrightArgs: ['e2e/gate', project, ...strictArgs],
});
const laneDefinitions = {
  state: {
    playwrightArgs: [...setupArgs, ...strictWorkers],
  },
  gate: gateLane([ksSq, mkMk], true),
  pr: gateLane([ksSq, mkContract], true),
  'gate-fast': gateLane([ksSq, mkMk]),
  'pr-fast': gateLane([ksSq, mkContract]),
  merge: {
    gatekeeper: true,
    playwrightArgs: [...mergeArgs, '--project=ks-sq', '--project=mk-mk', ...workerArgs],
  },
  'merge-fast': {
    gatekeeper: true,
    env: fastEnv,
    playwrightArgs: [...mergeArgs, ksSq, mkMk, ...workerArgs],
  },
  ks: projectLane(ksSq),
  mk: projectLane(mkMk),
  'ks-fast': projectLane(ksSq, fastEnv),
  'mk-fast': projectLane(mkMk, fastEnv),
  'front-door': {
    env: { PW_FRONT_DOOR: '1' },
    playwrightArgs: [
      'e2e/gate/front-door-session-context.spec.ts',
      '--project=front-door-ida-ks',
      '--project=front-door-ida-mk',
      ...strictWorkers,
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

process.env.BETTER_AUTH_SECRET = assertSecret(
  process.env.BETTER_AUTH_SECRET || loadSecret(),
  'environment'
);
const baseEnv = {
  ...process.env,
  E2E_DATABASE_URL: process.env.E2E_DATABASE_URL || dbUrl,
  E2E_DATABASE_URL_RLS: process.env.E2E_DATABASE_URL_RLS || process.env.E2E_DATABASE_URL || dbUrl,
  NEXT_PUBLIC_BILLING_TEST_MODE: '1',
};
const laneEnv = lane.env ? { ...baseEnv, ...lane.env } : baseEnv;
const stateEnv = { ...laneEnv, PW_FAST_GATES: '0' };
const finalEnv = laneName === 'state' ? stateEnv : laneEnv;
function run(command, args, env = baseEnv) {
  const result = spawnSync(command, args, { cwd: rootDir, env, stdio: 'inherit' });

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
  run('pnpm', [...pwArgs, ...laneDefinitions.state.playwrightArgs], stateEnv);
}
run('pnpm', [...pwArgs, ...lane.playwrightArgs, ...extraPlaywrightArgs], finalEnv);
