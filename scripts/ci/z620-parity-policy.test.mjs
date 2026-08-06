import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  validateCommandCoverage,
  validateGateCoverage,
  validateSourceDigests,
  validateWorkflowDigests,
} from './z620-parity-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const parity = JSON.parse(fs.readFileSync(path.join(root, 'scripts/ci/z620-parity.json')));
const gates = JSON.parse(fs.readFileSync(path.join(root, 'scripts/ci/z620-gates.json')));

test('workflow content matches the reviewed parity digests', () => {
  assert.deepEqual(validateWorkflowDigests(root, parity), []);
});

test('every non-provider blocking job has known local lane coverage', () => {
  assert.deepEqual(validateGateCoverage(parity, gates), []);
  assert.equal(gates.lanes.database.resourceOwned, true);
  assert.equal(gates.lanes.build.resourceOwned, true);
});

test('every substitutable command maps back to exact CI evidence', () => {
  assert.deepEqual(validateCommandCoverage(parity, gates), []);
  assert.deepEqual(validateSourceDigests(root, parity), []);
});

test('only exact command contracts are eligible for substitution', () => {
  assert.deepEqual(gates.substitutableCommands, [
    'check-architecture-boundaries',
    'check-db-access',
    'check-e2e-contracts-base',
    'coverage-gate',
    'e2e-gate-pr',
    'e2e-quarantine-budget',
    'e2e-smoke',
    'lint-production-warnings',
    'migration-journal-check',
    'release-gate-tests',
    'repo-size-check',
    'security-guard',
    'test-ci-contracts',
    'workspace-i18n',
  ]);
  const fixture = structuredClone(gates);
  fixture.substitutableCommands.push('db-rls-required');
  fixture.commandMetadata['db-rls-required'] = {
    env: { REQUIRE_RLS_COVERAGE: '1', REQUIRE_RLS_INTEGRATION: '1' },
    projects: [],
    specs: [],
  };
  fixture.commandCoverage['db-rls-required'] = ['.github/workflows/ci.yml#e2e-gate'];
  fixture.jobCommands['.github/workflows/ci.yml#e2e-gate'] = [
    {
      commandId: 'db-rls-required',
      argv: ['pnpm', 'db:rls:test:required'],
      env: { REQUIRE_RLS_COVERAGE: '1', REQUIRE_RLS_INTEGRATION: '1' },
      projects: [],
      specs: [],
    },
  ];
  assert.match(validateCommandCoverage(parity, fixture).join('\n'), /not exact-substitutable/u);
});

test('command parity rejects asymmetric command, env and project mappings', () => {
  const fixture = structuredClone(gates);
  delete fixture.commandCoverage['check-db-access'];
  const job = fixture.commandCoverage['e2e-gate-pr'][0];
  const record = fixture.jobCommands[job].find(item => item.commandId === 'e2e-gate-pr');
  record.projects = ['gate-ks-sq'];
  const problems = validateCommandCoverage(parity, fixture).join('\n');
  assert.match(problems, /check-db-access: missing CI counterpart/u);
  assert.match(problems, /e2e-gate-pr: workflow command\/env\/project\/spec mismatch/u);
});

test('command parity independently rejects argv, env, project and spec drift', async t => {
  const job = gates.commandCoverage['e2e-gate-pr'][0];
  const mutations = {
    argv: record => {
      record.argv = ['pnpm', 'e2e:gate'];
    },
    env: record => {
      record.env = { ...record.env, PW_EVIDENCE_LANE: 'wrong-lane' };
    },
    projects: record => {
      record.projects = ['gate-ks-sq'];
    },
    specs: record => {
      record.specs = ['e2e/golden'];
    },
  };
  for (const [field, mutate] of Object.entries(mutations)) {
    await t.test(field, () => {
      const fixture = structuredClone(gates);
      mutate(fixture.jobCommands[job].find(item => item.commandId === 'e2e-gate-pr'));
      assert.match(
        validateCommandCoverage(parity, fixture).join('\n'),
        /e2e-gate-pr: workflow command\/env\/project\/spec mismatch/u
      );
    });
  }
});

test('command parity rejects malformed metadata and unsafe spec paths', () => {
  const cases = [
    [fixture => delete fixture.commandMetadata['check-db-access'], /missing command metadata/u],
    [fixture => (fixture.commandMetadata['check-db-access'].extra = true), /unknown metadata key/u],
    [fixture => (fixture.commandMetadata['check-db-access'].env = []), /env must be an object/u],
    [
      fixture => (fixture.commandMetadata['check-db-access'].projects = {}),
      /projects must be an array/u,
    ],
    [fixture => (fixture.commandMetadata['check-db-access'].specs = {}), /specs must be an array/u],
    [
      fixture => (fixture.commandMetadata['e2e-gate-pr'].projects = ['gate-mk-mk', 'gate-ks-sq']),
      /projects must be sorted and unique/u,
    ],
    [
      fixture => (fixture.commandMetadata['e2e-gate-pr'].specs = ['e2e/gate', 'e2e/gate']),
      /specs must be sorted and unique/u,
    ],
    [fixture => (fixture.commandMetadata['e2e-gate-pr'].specs = ['../escape']), /unsafe spec/u],
  ];
  for (const [mutate, expected] of cases) {
    const fixture = structuredClone(gates);
    mutate(fixture);
    assert.match(validateCommandCoverage(parity, fixture).join('\n'), expected);
  }
});

test('command parity rejects unknown, duplicate and one-way mappings', () => {
  const job = gates.commandCoverage['e2e-gate-pr'][0];
  const cases = [
    [fixture => fixture.substitutableCommands.push('unknown-command'), /unknown gate command/u],
    [fixture => fixture.commandCoverage['e2e-gate-pr'].push(job), /duplicate CI job/u],
    [fixture => (fixture.commandCoverage['e2e-gate-pr'] = []), /missing CI counterpart/u],
    [
      fixture => (fixture.commandCoverage['e2e-gate-pr'] = ['.github\/workflows\/ci.yml#ghost']),
      /unknown or excluded CI job/u,
    ],
    [fixture => delete fixture.jobCoverage[job], /missing forward job coverage/u],
    [
      fixture => (fixture.jobCommands['.github\/workflows\/ci.yml#ghost'] = []),
      /unknown or excluded job commands/u,
    ],
    [
      fixture => fixture.jobCommands[job].push(structuredClone(fixture.jobCommands[job][0])),
      /duplicate command ID/u,
    ],
  ];
  for (const [mutate, expected] of cases) {
    const fixture = structuredClone(gates);
    mutate(fixture);
    assert.match(validateCommandCoverage(parity, fixture).join('\n'), expected);
  }
});

test('reviewed command sources fail closed on inventory or content drift', () => {
  const missing = structuredClone(parity);
  delete missing.sourceDigests['package.json'];
  assert.match(validateSourceDigests(root, missing).join('\n'), /source digest inventory/iu);

  const changed = structuredClone(parity);
  changed.sourceDigests['package.json'] = '0'.repeat(64);
  assert.match(
    validateSourceDigests(root, changed).join('\n'),
    /source changed without parity digest/u
  );
});

test('workflow changes fail closed until parity is reviewed', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-policy-'));
  for (const workflowPath of Object.keys(parity.workflows)) {
    const destination = path.join(fixtureRoot, workflowPath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, workflowPath), destination);
  }
  fs.appendFileSync(path.join(fixtureRoot, '.github/workflows/ci.yml'), '\n# fixture change\n');
  assert.match(validateWorkflowDigests(fixtureRoot, parity).join('\n'), /without parity digest/);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test('unknown and missing lane mappings fail closed', () => {
  const fixture = structuredClone(gates);
  delete fixture.jobCoverage['.github/workflows/ci.yml#static'];
  fixture.jobCoverage['.github/workflows/ci.yml#ghost'] = ['missing-lane'];
  const problems = validateGateCoverage(parity, fixture).join('\n');
  assert.match(problems, /static: missing local gate coverage/);
  assert.match(problems, /ghost: unknown or excluded job coverage/);
  assert.match(problems, /unknown lane missing-lane/);
});
