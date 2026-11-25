#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
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
const localMac = process.platform === 'darwin' && process.env.GITHUB_ACTIONS !== 'true';
const localMacReportDir = '.tmp/playwright/local-mac';
const localMacGateArgs = cap => [`--max-failures=${cap}`, '--trace=retain-on-failure'];
// Hosted main CI also runs the full gate.
const fullGateWorkers = localMac ? localMacGateArgs(10) : strictWorkers;
const stateRunnerArgs = localMac ? localMacGateArgs(1) : strictWorkers;
// The gate projects also admit the configured security specs (GATE_SECURITY_MATCH); the path filter
// must not drop them.
const gatePaths = ['e2e/gate', 'e2e/security'];
const setupArgs = ['e2e/setup.state.spec.ts', '--project=setup-ks', '--project=setup-mk'];
const mergeArgs = ['e2e/gate', 'e2e/golden', '--grep-invert', '@quarantine|@visual|@legacy'];
const pwArgs = ['--filter', '@interdomestik/web', 'exec', 'playwright', 'test'];
const fastEnv = { PW_FAST_GATES: '1' };
const ksSq = '--project=gate-ks-sq';
const mkMk = '--project=gate-mk-mk';
const mkContract = '--project=gate-mk-contract';
const smokeIda = '--project=smoke-ida';
const gateLane = (projects, state = false, runnerArgs = strictWorkers) => ({
  gatekeeper: true,
  state,
  env: fastEnv,
  playwrightArgs: [...gatePaths, ...runnerArgs, ...projects],
});
const projectLane = (project, env) => ({
  gatekeeper: true,
  ...(env && { env }),
  playwrightArgs: ['e2e/gate', project, ...strictArgs],
});
const laneDefinitions = {
  state: { playwrightArgs: [...setupArgs, ...stateRunnerArgs] },
  gate: gateLane([ksSq, mkMk], true, fullGateWorkers),
  pr: gateLane([ksSq, mkContract], true),
  'pr-ks': gateLane([ksSq], true),
  'pr-mk-contract': gateLane([mkContract], true),
  'pr-smoke': {
    gatekeeper: true,
    playwrightArgs: ['--grep', '@smoke', '--project=ks-sq', '--project=mk-mk', '--workers=1'],
  },
  smoke: { pnpmArgs: ['--filter', '@interdomestik/web', 'run', 'e2e:smoke'] },
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
    `Usage: node scripts/run-e2e-lane.mjs <lane> [playwright args...]\n\nLanes: ${lanes}\n\n` +
      `Local Mac setup, gate and smoke write reports and artifacts to ${localMacReportDir}/<head>/<lane>-<invocation>/`
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
if (!lane) {
  usage();
  process.exit(2);
}
const keepPilotMk =
  (laneName === 'pr' || laneName === 'pr-fast') &&
  extraPlaywrightArgs.some(arg => arg.includes('/pilot/'));
if (keepPilotMk) lane.playwrightArgs.push(mkMk);

async function run(command, args, env) {
  try {
    await runDetachedCommand(command, args, { cwd: rootDir, env });
  } catch (error) {
    console.error(error);
    process.exit(error?.exitCode ?? 1);
  }
}

async function runPlaywright(name, args, env) {
  if (!localMac || !['state', 'gate', 'smoke'].includes(name)) {
    return run('pnpm', args, env);
  }

  const head = execFileSync('/usr/bin/git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
  // Playwright clears the artifacts directory on startup. Keep it unique and beside the report.
  const invocationDir = path.join(rootDir, localMacReportDir, head, `${name}-${randomUUID()}`);
  const report = path.join(invocationDir, 'report.json');
  const output = path.join(invocationDir, 'artifacts');
  console.log(`[e2e] ${name} JSON report: ${report}`);
  return run(
    'pnpm',
    [...args, '--retries=0', '--workers=1', '--reporter=line,json', `--output=${output}`],
    {
      ...env,
      // The config creates its evidence directory before applying the CLI overrides.
      PW_EVIDENCE_LANE: 'default',
      PLAYWRIGHT_JSON_OUTPUT_FILE: report,
    }
  );
}

if (lane.pnpmArgs) {
  // Keep the package smoke command's environment and preparation steps.
  await runPlaywright(laneName, [...lane.pnpmArgs, ...extraPlaywrightArgs], process.env);
} else {
  const shouldRunLocalDoctor =
    lane.gatekeeper &&
    process.env.SKIP_DOCKER_DOCTOR !== '1' &&
    process.env.CI !== 'true' &&
    !process.env.E2E_DATABASE_URL;
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
  if (shouldRunLocalDoctor) await run('pnpm', ['run', 'doctor'], laneEnv);
  await ensureLocalTestHosts({ required: process.env.CI === 'true' });
  if (lane.gatekeeper) await run('bash', ['scripts/m4-gatekeeper.sh'], laneEnv);
  if (lane.state) {
    await runPlaywright('state', [...pwArgs, ...laneDefinitions.state.playwrightArgs], stateEnv);
  }
  await runPlaywright(
    laneName,
    [...pwArgs, ...lane.playwrightArgs, ...extraPlaywrightArgs],
    finalEnv
  );
}
