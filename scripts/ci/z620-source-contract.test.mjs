import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gates } from './z620-parity-policy-fixtures.mjs';
import {
  deriveSourceCommandRecords,
  deriveTaskDatabaseEnv,
  validateSourceCommandRecords,
} from './z620-source-contract-lib.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const TASK_DATABASE_ENV = {
  E2E_DATABASE_URL: '$TASK_DATABASE_URL',
  E2E_DATABASE_URL_RLS: '$TASK_DATABASE_URL',
};
const expectedRecords = {
  '.github/workflows/ci.yml#unit': [
    {
      commandId: 'coverage-gate',
      argv: ['pnpm', 'coverage:gate'],
      env: {
        UPSTASH_REDIS_REST_TOKEN: 'dummy-token',
        UPSTASH_REDIS_REST_URL: 'http://localhost:8080',
      },
      projects: [],
      specs: [],
    },
  ],
  '.github/workflows/e2e-pr.yml#e2e-runner': [
    {
      commandId: 'e2e-gate-pr',
      argv: ['pnpm', 'e2e:gate:pr'],
      env: { ...TASK_DATABASE_ENV, PW_EVIDENCE_LANE: 'pr-gate' },
      projects: ['gate-ks-sq', 'gate-mk-contract', 'gate-mk-mk', 'setup-ks', 'setup-mk'],
      specs: ['e2e/gate', 'e2e/setup.state.spec.ts'],
    },
    {
      commandId: 'e2e-smoke',
      argv: ['pnpm', '--filter', '@interdomestik/web', 'run', 'e2e:smoke'],
      env: { ...TASK_DATABASE_ENV, PW_EVIDENCE_LANE: 'pr-smoke' },
      projects: ['ks-sq', 'mk-mk'],
      specs: [],
    },
  ],
};

function copySources(targetRoot) {
  const paths = [
    '.github/workflows/ci.yml',
    '.github/workflows/e2e-pr.yml',
    'apps/web/package.json',
    'scripts/ci/z620-resource-run.mjs',
    'scripts/run-e2e-lane.mjs',
  ];
  for (const relative of paths) {
    const destination = path.join(targetRoot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination);
  }
}

test('current workflow steps and package/lane authorities derive exact job records', () => {
  assert.deepEqual(deriveTaskDatabaseEnv(root), TASK_DATABASE_ENV);
  assert.deepEqual(deriveSourceCommandRecords(root), expectedRecords);
  assert.deepEqual(validateSourceCommandRecords(root, gates), []);
});

test('mutated current source and checked-in record both fail source-derived validation', t => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-source-contract-'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  copySources(fixtureRoot);
  const packagePath = path.join(fixtureRoot, 'apps/web/package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath));
  packageJson.scripts['e2e:smoke'] = packageJson.scripts['e2e:smoke'].replace(
    '--project=mk-mk',
    '--project=smoke-ida'
  );
  fs.writeFileSync(packagePath, JSON.stringify(packageJson));
  assert.match(
    validateSourceCommandRecords(fixtureRoot, gates).join('\n'),
    /e2e-smoke: source-derived command record mismatch/u
  );

  const changed = structuredClone(gates);
  changed.jobCommands['.github/workflows/ci.yml#unit'][0].env = {};
  assert.match(
    validateSourceCommandRecords(root, changed).join('\n'),
    /coverage-gate: checked-in command record mismatch/u
  );
});
