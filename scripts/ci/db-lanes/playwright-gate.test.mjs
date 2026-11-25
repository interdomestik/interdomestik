import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { inventoryFixture, updateWorkflow } from './inventory-fixture.mjs';
import { repositoryInventory } from './inventory.mjs';

const browserSpec = 'apps/web/e2e/gate/fixture/database-helpers.spec.ts';
const browserSource = [
  "import { db } from '@interdomestik/database';",
  "import { expect, test } from '@playwright/test';",
  "test('uses the database fixture', () => { expect(db).toBeDefined(); });",
].join('\n');
const orphan = { message: `Database tests with no CI lane: ${browserSpec}` };

test('credits the full Playwright gate for a spec that imports database helpers', t => {
  const root = inventoryFixture(t, [[browserSpec, browserSource]]);
  const row = () => repositoryInventory(root).find(row => row.file === browserSpec);
  assert.deepEqual(row(), { file: browserSpec, lanes: ['e2e-gate/playwright'] });

  const config = join(root, 'apps/web/playwright.config.ts');
  const source = readFileSync(config, 'utf8');
  writeFileSync(config, source.replace('testMatch: GATE_MK_TEST_MATCH', 'testMatch: []'));
  assert.throws(row, orphan);
  writeFileSync(config, source);

  const runner = join(root, 'scripts/run-e2e-lane.mjs');
  const runnerSource = readFileSync(runner, 'utf8');
  const filteredArgs = ": [...strictWorkers, '--grep', '@smoke'];";
  writeFileSync(runner, runnerSource.replace(': strictWorkers;', filteredArgs));
  assert.throws(row, orphan);
  writeFileSync(runner, runnerSource);
  updateWorkflow(root, workflow => {
    const gate = workflow.jobs['e2e-gate'].steps.find(step => step.name === 'E2E Gate Suite');
    gate.if = false;
  });
  assert.throws(row, orphan);
});

test('reports a database-backed browser spec outside the full gate selection', t => {
  const file = 'apps/web/e2e/fixture/database-helpers.spec.ts';
  const root = inventoryFixture(t, [[file, browserSource]]);
  assert.throws(() => repositoryInventory(root), {
    message: `Database tests with no CI lane: ${file}`,
  });
});

const dispatch = '  await runPlaywright(\n    laneName,';
for (const [where, anchor, mutation] of [
  [
    'the selected lane',
    'if (keepPilotMk) lane.playwrightArgs.push(mkMk);',
    "if (laneName === 'gate') lane.playwrightArgs.push('--grep', '@smoke');",
  ],
  [
    'an alias of the lane arguments',
    dispatch,
    "  const gateArgs = lane.playwrightArgs;\n  gateArgs.push('--grep=@smoke');",
  ],
  [
    'the forwarded arguments before dispatch',
    dispatch,
    "  extraPlaywrightArgs.push('--grep', '@smoke');",
  ],
  [
    'the shared worker arguments',
    'const laneDefinitions = {',
    "strictWorkers.push('--grep', '@smoke');",
  ],
  [
    'the hosted Playwright invocation',
    "    return run('pnpm', args, env);",
    "    if (name === 'gate') args.push('--grep', '@smoke');",
  ],
]) {
  test(`withholds full gate credit when a filter is appended to ${where}`, t => {
    const root = inventoryFixture(t, [[browserSpec, browserSource]]);
    const row = () => repositoryInventory(root).find(row => row.file === browserSpec);
    assert.deepEqual(row(), { file: browserSpec, lanes: ['e2e-gate/playwright'] });

    const runner = join(root, 'scripts/run-e2e-lane.mjs');
    const source = readFileSync(runner, 'utf8');
    assert.ok(source.includes(anchor));
    writeFileSync(runner, source.replace(anchor, `${mutation}\n${anchor}`));
    assert.throws(row, orphan);
  });
}
