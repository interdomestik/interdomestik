import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCommandCoverage } from './z620-parity-lib.mjs';
import { gates, parity } from './z620-parity-policy-fixtures.mjs';

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
