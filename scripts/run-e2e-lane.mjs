#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultDbUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const baseEnv = {
  ...process.env,
  E2E_DATABASE_URL: process.env.E2E_DATABASE_URL || defaultDbUrl,
  E2E_DATABASE_URL_RLS:
    process.env.E2E_DATABASE_URL_RLS || process.env.E2E_DATABASE_URL || defaultDbUrl,
  NEXT_PUBLIC_BILLING_TEST_MODE: '1',
};

const commonGateArgs = [
  'e2e/gate',
  '--workers=1',
  '--max-failures=1',
  '--trace=retain-on-failure',
  '--reporter=line',
];

const laneDefinitions = {
  state: {
    playwrightArgs: [
      'e2e/setup.state.spec.ts',
      '--project=setup-ks',
      '--project=setup-mk',
      '--workers=1',
      '--max-failures=1',
      '--trace=retain-on-failure',
      '--reporter=line',
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
      '--workers=1',
      '--trace=retain-on-failure',
      '--reporter=line',
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
      '--workers=1',
      '--trace=retain-on-failure',
      '--reporter=line',
    ],
  },
  ks: {
    gatekeeper: true,
    playwrightArgs: [
      'e2e/gate',
      '--project=gate-ks-sq',
      '--max-failures=1',
      '--trace=retain-on-failure',
      '--reporter=line',
    ],
  },
  mk: {
    gatekeeper: true,
    playwrightArgs: [
      'e2e/gate',
      '--project=gate-mk-mk',
      '--max-failures=1',
      '--trace=retain-on-failure',
      '--reporter=line',
    ],
  },
  'ks-fast': {
    gatekeeper: true,
    env: { PW_FAST_GATES: '1' },
    playwrightArgs: [
      'e2e/gate',
      '--project=gate-ks-sq',
      '--max-failures=1',
      '--trace=retain-on-failure',
      '--reporter=line',
    ],
  },
  'mk-fast': {
    gatekeeper: true,
    env: { PW_FAST_GATES: '1' },
    playwrightArgs: [
      'e2e/gate',
      '--project=gate-mk-mk',
      '--max-failures=1',
      '--trace=retain-on-failure',
      '--reporter=line',
    ],
  },
  'front-door': {
    env: { PW_FRONT_DOOR: '1' },
    playwrightArgs: [
      'e2e/gate/front-door-session-context.spec.ts',
      '--project=front-door-ida-ks',
      '--project=front-door-ida-mk',
      '--workers=1',
      '--max-failures=1',
      '--trace=retain-on-failure',
      '--reporter=line',
    ],
  },
};

function usage() {
  console.error(
    [
      'Usage: node scripts/run-e2e-lane.mjs <lane> [playwright args...]',
      '',
      `Lanes: ${Object.keys(laneDefinitions).join(', ')}`,
    ].join('\n')
  );
}

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

const laneEnv = lane.env ? { ...baseEnv, ...lane.env } : baseEnv;

if (lane.gatekeeper) {
  run('bash', ['scripts/m4-gatekeeper.sh'], laneEnv);
}

if (lane.state) {
  run('pnpm', [
    '--filter',
    '@interdomestik/web',
    'exec',
    'playwright',
    'test',
    ...laneDefinitions.state.playwrightArgs,
  ]);
}

run(
  'pnpm',
  [
    '--filter',
    '@interdomestik/web',
    'exec',
    'playwright',
    'test',
    ...lane.playwrightArgs,
    ...extraPlaywrightArgs,
  ],
  laneEnv
);
