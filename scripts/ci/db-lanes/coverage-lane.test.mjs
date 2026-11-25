import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  configPath,
  copyProtectedSelectors,
  inventoryFixture,
  mockSuite,
  project,
  scratch,
  suite,
  updateWorkflow,
} from './inventory-fixture.mjs';
import { repoRoot, repositoryInventory } from './inventory.mjs';
import { protectedLanes } from './protected-lanes.mjs';

function suiteLanes(root) {
  return repositoryInventory(root).find(({ file }) => file === suite)?.lanes;
}

for (const [scope, condition] of [
  ['job', false],
  ['job', "github.event_name == 'push'"],
  ['job', "needs.validation-surface.outputs.run_broad == 'true'"],
  ['step', false],
  ['step', "${{ vars.RUN_COVERAGE == 'true' }}"],
]) {
  test(`runs the suite in advisory when the coverage ${scope} condition is ${condition}`, t => {
    const root = inventoryFixture(t);
    assert.deepEqual(suiteLanes(root), ['unit/coverage']);
    updateWorkflow(root, ({ jobs: { unit } }) => {
      const target =
        scope === 'job' ? unit : unit.steps.find(step => step.name === 'Coverage Gate');
      target.if = condition;
    });
    assert.deepEqual(suiteLanes(root), ['advisory/vitest-pg16']);
  });
}

for (const transitive of [false, true]) {
  test(`runs the suite in advisory when a ${transitive ? 'transitive' : 'direct'} coverage prerequisite is disabled`, t => {
    const root = inventoryFixture(t);
    const prerequisite = transitive ? 'preflight' : 'validation-surface';
    if (transitive) {
      updateWorkflow(root, ({ jobs }) => {
        jobs.preflight = { 'runs-on': 'ubuntu-latest', steps: [{ run: 'true' }] };
        jobs['validation-surface'].needs = 'preflight';
      });
    }
    assert.deepEqual(suiteLanes(root), ['unit/coverage']);
    updateWorkflow(root, ({ jobs }) => {
      jobs[prerequisite].if = false;
    });
    assert.deepEqual(suiteLanes(root), ['advisory/vitest-pg16']);
  });
}

test('runs the suite in advisory when a case can skip through its context', t => {
  const root = inventoryFixture(t);
  assert.deepEqual(suiteLanes(root), ['unit/coverage']);
  writeFileSync(
    join(root, suite),
    mockSuite.replace(
      "it('runs', () => {})",
      "it('runs', ({ skip }) => { skip(process.env.REQUIRE_RLS_INTEGRATION !== '1'); })"
    )
  );
  assert.deepEqual(suiteLanes(root), ['advisory/vitest-pg16']);
});

for (const modifier of ['runIf', 'skipIf']) {
  test(`runs the suite in advisory when an imported helper uses ${modifier}`, t => {
    const root = inventoryFixture(t);
    assert.deepEqual(suiteLanes(root), ['unit/coverage']);
    writeFileSync(
      join(root, dirname(suite), 'contract-test-support.ts'),
      [
        "import { describe } from 'vitest';",
        `export const describeResetContract = describe.${modifier}(Boolean(process.env.LIVE_DB_PROOF));`,
      ].join('\n')
    );
    writeFileSync(
      join(root, suite),
      [
        "import { describeResetContract as contract } from './contract-test-support';",
        mockSuite,
        "contract('live suite', () => { it('runs conditionally', () => {}); });",
      ].join('\n')
    );
    assert.deepEqual(suiteLanes(root), ['advisory/vitest-pg16']);
  });
}

for (const [label, source] of [
  ['a runtime helper', "it('runs', () => { skipUnlessReady(); })"],
  ['a skipped case', "it.skip('runs', () => {})"],
  ['an exclusive case', "it.only('runs', () => {})"],
  ['a TODO case', "it.todo('runs')"],
  ['a conditional case', "it.runIf(enabled)('runs', () => {})"],
]) {
  test(`runs the suite in advisory when it has ${label} beside a runnable case`, t => {
    const root = inventoryFixture(t);
    writeFileSync(join(root, suite), `${mockSuite}\n${source};`);
    assert.deepEqual(suiteLanes(root), ['advisory/vitest-pg16']);
  });
}

test('reports an orphan when both Vitest selectors exclude a tracked database suite', t => {
  const root = inventoryFixture(t);
  assert.deepEqual(suiteLanes(root), ['unit/coverage']);
  const filename = join(root, configPath);
  writeFileSync(
    filename,
    readFileSync(filename, 'utf8').replace(
      'coverage: {',
      "exclude: ['**/get-users.rls.test.ts'],\n    coverage: {"
    )
  );
  assert.throws(
    () => repositoryInventory(root),
    /Database tests with no CI lane: packages\/domain-users\/src\/admin\/get-users\.rls\.test\.ts/u
  );
});

test('coverage credit follows the domain Vitest include and exclude selectors', t => {
  const root = scratch(t);
  copyProtectedSelectors(root);
  const config = readFileSync(join(repoRoot, configPath), 'utf8');
  const files = [suite, `${project}/src/new.rls.test.ts`];
  symlinkSync(join(repoRoot, 'node_modules'), join(root, 'node_modules'));
  symlinkSync(join(repoRoot, project, 'node_modules'), join(root, project, 'node_modules'));
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(
      join(root, file),
      mockSuite
        .replace('describe, it, vi', 'describe, expect, it, vi')
        .replace('() => {});', '() => expect(1).toBe(2));')
    );
  }
  const coverage = () => protectedLanes(root, files).find(lane => lane.name === 'unit/coverage');
  writeFileSync(join(root, configPath), config);
  assert.deepEqual(coverage().files, files);

  const narrower = config.replace('src/**/*.test.ts', 'src/*.test.ts');
  writeFileSync(join(root, configPath), narrower);
  assert.deepEqual(coverage().files, [files[1]]);

  const excluded = narrower.replace(
    'coverage: {',
    "exclude: ['**/new.rls.test.ts'],\n    coverage: {"
  );
  writeFileSync(join(root, configPath), excluded);
  assert.equal(coverage(), undefined);
});

test('runs the suite in advisory when the coverage command adds a case filter', t => {
  const root = inventoryFixture(t);
  assert.deepEqual(suiteLanes(root), ['unit/coverage']);
  const file = join(root, 'package.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  manifest.scripts['test:coverage'] += ' --testNamePattern=never-matches';
  writeFileSync(file, JSON.stringify(manifest));
  assert.deepEqual(suiteLanes(root), ['advisory/vitest-pg16']);
});

for (const option of [
  'testNamePattern: /^smoke/',
  'testNamePattern: /runs/',
  'allowOnly: true',
  'skip: true',
  'tagsFilter: ["smoke"]',
]) {
  test(`runs the suite in advisory when the Vitest project sets ${option}`, t => {
    const root = inventoryFixture(t);
    assert.deepEqual(suiteLanes(root), ['unit/coverage']);
    const file = join(root, configPath);
    writeFileSync(file, readFileSync(file, 'utf8').replace('test: {', `test: {\n    ${option},`));
    assert.deepEqual(suiteLanes(root), ['advisory/vitest-pg16']);
  });
}

test('fails closed when a protected test runner adds an unrecognized case filter', t => {
  const root = scratch(t);
  copyProtectedSelectors(root);
  assert.ok(protectedLanes(root)[0].files.length > 0);
  const filename = join(root, 'packages/database/package.json');
  const manifest = JSON.parse(readFileSync(filename, 'utf8'));
  manifest.scripts['test:rls'] += ' --test-name-pattern=never-matches';
  writeFileSync(filename, JSON.stringify(manifest));
  assert.throws(() => protectedLanes(root), /unsupported file selector.*database test:rls/iu);
});

test('a message RLS command without its opt-in cannot claim protected credit', t => {
  const root = scratch(t);
  copyProtectedSelectors(root);
  const filename = join(root, 'packages/domain-claims/package.json');
  const manifest = JSON.parse(readFileSync(filename, 'utf8'));
  manifest.scripts['test:rls'] = manifest.scripts['test:rls'].replace(
    'MESSAGE_RLS_INTEGRATION=1 ',
    ''
  );
  writeFileSync(filename, JSON.stringify(manifest));
  assert.throws(
    () => protectedLanes(root),
    /Missing MESSAGE_RLS_INTEGRATION=1.*domain-claims test:rls/u
  );
});
