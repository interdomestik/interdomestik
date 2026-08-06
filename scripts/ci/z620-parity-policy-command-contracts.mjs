import assert from 'node:assert/strict';
import test from 'node:test';
import * as gateCommands from './z620-gate-command-lib.mjs';
import { validateGateCommandMetadata } from './z620-gate-command-policy.mjs';
import { validateCommandCoverage } from './z620-parity-lib.mjs';
import { gates, parity } from './z620-parity-policy-fixtures.mjs';

const TASK_DATABASE_ENV = {
  E2E_DATABASE_URL: '$TASK_DATABASE_URL',
  E2E_DATABASE_URL_RLS: '$TASK_DATABASE_URL',
};

test('static command authority owns execution and normalized environment contracts', () => {
  const coverage = gateCommands.resolveGateCommand('coverage-gate');
  assert.equal(Object.isFrozen(coverage), true);
  assert.equal(Object.isFrozen(coverage.args), true);
  assert.equal(Object.isFrozen(coverage.executionEnv), true);
  assert.equal(Object.isFrozen(coverage.normalizedEnvContract), true);
  assert.deepEqual(coverage.executionEnv, {
    UPSTASH_REDIS_REST_TOKEN: 'dummy-token',
    UPSTASH_REDIS_REST_URL: 'http://localhost:8080',
  });
  assert.deepEqual(gateCommands.resolveGateCommand('e2e-gate-pr').executionEnv, {
    PW_EVIDENCE_LANE: 'pr-gate',
  });
  assert.deepEqual(gateCommands.resolveGateCommand('e2e-gate-pr').normalizedEnvContract, {
    ...TASK_DATABASE_ENV,
    PW_EVIDENCE_LANE: 'pr-gate',
  });
  assert.deepEqual(gateCommands.resolveGateCommand('e2e-smoke').normalizedEnvContract, {
    ...TASK_DATABASE_ENV,
    PW_EVIDENCE_LANE: 'pr-smoke',
  });
});

test('static execution env overrides task base env without accepting JSON metadata', () => {
  assert.equal(typeof gateCommands.gateCommandEnvironment, 'function');
  const taskBase = {
    E2E_DATABASE_URL: 'postgresql://task-owned',
    PW_EVIDENCE_LANE: 'unreviewed',
    UNRELATED_TASK_VALUE: 'preserved',
  };
  assert.deepEqual(gateCommands.gateCommandEnvironment(taskBase, 'e2e-gate-pr'), {
    ...taskBase,
    PW_EVIDENCE_LANE: 'pr-gate',
  });
});

test('expected records derive env from static authority and metadata env drift is rejected', () => {
  const metadata = { env: { PW_EVIDENCE_LANE: 'unreviewed' }, projects: [], specs: [] };
  const record = gateCommands.expectedGateCommandRecord('coverage-gate', metadata);
  assert.deepEqual(record.env, {
    UPSTASH_REDIS_REST_TOKEN: 'dummy-token',
    UPSTASH_REDIS_REST_URL: 'http://localhost:8080',
  });
  assert.match(
    validateGateCommandMetadata('coverage-gate', metadata).join('\n'),
    /static command env contract/u
  );
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
