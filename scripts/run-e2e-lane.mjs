#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureLocalTestHosts } from './ci/ensure-local-test-hosts.mjs';
import { playwrightReportArgs } from './ci/playwright-lane-evidence.mjs';
import { runDetachedCommand } from './ci/run-detached-command.mjs';

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
const reportArgs = playwrightReportArgs(process.env.PW_EVIDENCE_LANE);
const strictArgs = ['--max-failures=1', ...reportArgs];
const workerArgs = ['--workers=1', ...reportArgs];
const strictWorkers = ['--workers=1', ...strictArgs];
// The gate projects also admit the configured security specs (GATE_SECURITY_MATCH); the path filter
// must not drop them.
const gateArgs = ['e2e/gate', 'e2e/security', ...strictWorkers];
const setupArgs = ['e2e/setup.state.spec.ts', '--project=setup-ks', '--project=setup-mk'];
const mergeArgs = ['e2e/gate', 'e2e/golden', '--grep-invert', '@quarantine|@visual|@legacy'];
const pwArgs = ['--filter', '@interdomestik/web', 'exec', 'playwright', 'test'];
const fastEnv = { PW_FAST_GATES: '1' };
const ksSq = '--project=gate-ks-sq';
const ksIntakeSwitch = '--project=gate-ks-intake-switch';
const ksParallelConfig = '--config=playwright.ks-parallel.config.ts';
const mkMk = '--project=gate-mk-mk';
const mkContract = '--project=gate-mk-contract';
const smokeIda = '--project=smoke-ida';
const gateLane = (projects, state = false) => ({
  gatekeeper: true,
  state,
  env: fastEnv,
  playwrightArgs: [...gateArgs, ...projects],
});
const projectLane = (projectArgs, env) => ({
  gatekeeper: true,
  ...(env && { env }),
  playwrightArgs: ['e2e/gate', ...projectArgs, ...strictArgs],
});
const ksLane = env => ({
  gatekeeper: true,
  env,
  playwrightArgs: [ksParallelConfig, ksSq, ...strictArgs],
  intakeSwitchArgs: [ksParallelConfig, ksIntakeSwitch, ...strictArgs],
});
const laneDefinitions = {
  state: { playwrightArgs: [...setupArgs, ...strictWorkers] },
  gate: gateLane([ksSq, mkMk], true),
  pr: gateLane([ksSq, mkContract], true),
  'pr-ks': gateLane([ksSq], true),
  'pr-mk-contract': gateLane([mkContract], true),
  'pr-smoke': {
    gatekeeper: true,
    playwrightArgs: ['--grep', '@smoke', '--project=ks-sq', '--project=mk-mk', '--workers=1'],
  },
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
  'smoke-ida': {
    gatekeeper: true,
    playwrightArgs: ['e2e/smoke/ida-dashboard-smoke.spec.ts', smokeIda, ...strictWorkers],
  },
  ks: ksLane(),
  mk: projectLane([mkMk]),
  'ks-fast': ksLane(fastEnv),
  'mk-fast': projectLane([mkMk], fastEnv),
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

// An explicit empty lane is unknown and refused; only an absent argument selects the default.
const laneName = process.argv.length > 2 ? process.argv[2] : 'gate';
const extraPlaywrightArgs = process.argv.slice(3);
if (laneName === '-h' || laneName === '--help' || laneName === 'help') {
  usage();
  process.exit(0);
}
const lane = laneDefinitions[laneName];
const shouldRunLocalDoctor =
  lane?.gatekeeper &&
  process.env.SKIP_DOCKER_DOCTOR !== '1' &&
  process.env.CI !== 'true' &&
  !process.env.E2E_DATABASE_URL;

if (!lane) {
  usage();
  process.exit(2);
}
const keepPilotMk =
  (laneName === 'pr' || laneName === 'pr-fast') &&
  extraPlaywrightArgs.some(arg => arg.includes('/pilot/'));
if (keepPilotMk) lane.playwrightArgs.push(mkMk);
const envSecret = process.env.BETTER_AUTH_SECRET;
process.env.BETTER_AUTH_SECRET =
  envSecret === undefined ? loadSecret() : assertSecret(envSecret, 'environment');
const baseEnv = {
  ...process.env,
  E2E_DATABASE_URL: process.env.E2E_DATABASE_URL || dbUrl,
  E2E_DATABASE_URL_RLS: process.env.E2E_DATABASE_URL_RLS || process.env.E2E_DATABASE_URL || dbUrl,
  NEXT_PUBLIC_BILLING_TEST_MODE: '1',
};
const laneEnv = lane.env ? { ...baseEnv, ...lane.env } : baseEnv;
const stateEnv = { ...laneEnv, PW_FAST_GATES: '0' };
const finalEnv = laneName === 'state' ? stateEnv : laneEnv;
async function run(command, args, env = baseEnv) {
  try {
    await runDetachedCommand(command, args, { cwd: rootDir, env });
  } catch (error) {
    console.error(error);
    process.exit(error?.exitCode ?? 1);
  }
}
if (shouldRunLocalDoctor) await run('pnpm', ['run', 'doctor'], laneEnv);
await ensureLocalTestHosts({ required: process.env.CI === 'true' });
if (lane.gatekeeper) await run('bash', ['scripts/m4-gatekeeper.sh'], laneEnv);
if (lane.state) await run('pnpm', [...pwArgs, ...laneDefinitions.state.playwrightArgs], stateEnv);
const passes = [lane.playwrightArgs];
if (lane.intakeSwitchArgs) passes.push(lane.intakeSwitchArgs);
// A caller's filters can select tests from just one of the two KS passes.
const emptyPassArgs =
  lane.intakeSwitchArgs && extraPlaywrightArgs.length ? ['--pass-with-no-tests'] : [];
for (const args of passes) {
  await run('pnpm', [...pwArgs, ...args, ...emptyPassArgs, ...extraPlaywrightArgs], finalEnv);
}
