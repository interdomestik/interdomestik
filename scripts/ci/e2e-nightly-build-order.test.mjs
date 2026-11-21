import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// Without a build before the first Playwright step, the web server (scripts/e2e-webserver.sh)
// builds the app lazily inside Playwright's 300 s start timeout, which a cold CI build overruns.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKFLOW = '.github/workflows/e2e-nightly.yml';
const PREPARE_STEP = 'Prepare E2E database and app artifact';
const BUILD_LINE = 'pnpm --filter @interdomestik/web run build:ci';
const PLAYWRIGHT_RUN = /playwright test|e2e:state:setup|e2e:gate|test:smoke/u;

function buildOrderViolation(workflow) {
  const steps = workflow?.jobs?.e2e?.steps ?? [];
  const prepareIndex = steps.findIndex(step => step?.name === PREPARE_STEP);
  if (prepareIndex === -1) return 'missing-prepare-step';
  const lines = (steps[prepareIndex].run ?? '').split('\n').map(line => line.trim());
  if (!lines.includes(BUILD_LINE)) return 'missing-build';
  const playwrightIndexes = steps.flatMap((step, index) =>
    PLAYWRIGHT_RUN.test(step?.run ?? '') ? [index] : []
  );
  if (playwrightIndexes.length === 0) return 'no-playwright-steps';
  return playwrightIndexes.every(index => index > prepareIndex) ? null : 'build-after-playwright';
}

const workflow = yaml.load(fs.readFileSync(path.join(root, WORKFLOW), 'utf8'));
const prepare = {
  name: PREPARE_STEP,
  run: 'pnpm seed:e2e\npnpm --filter @interdomestik/web run build:ci\n',
};
const gate = { name: 'E2E Gate', run: 'pnpm --filter @interdomestik/web run e2e:gate' };
const wrap = steps => ({ jobs: { e2e: { steps } } });

test('Nightly E2E builds the app before every Playwright step', () => {
  assert.equal(buildOrderViolation(workflow), null);
  const steps = workflow.jobs.e2e.steps;
  assert.ok(steps.filter(step => PLAYWRIGHT_RUN.test(step.run ?? '')).length >= 4);
});

test('Nightly build order refuses a missing, empty, absent or late build', () => {
  assert.equal(buildOrderViolation(undefined), 'missing-prepare-step');
  assert.equal(buildOrderViolation(wrap([gate])), 'missing-prepare-step');
  assert.equal(buildOrderViolation(wrap([{ ...prepare, run: '' }, gate])), 'missing-build');
  assert.equal(
    buildOrderViolation(
      wrap([{ ...prepare, run: '# pnpm --filter @interdomestik/web run build:ci' }, gate])
    ),
    'missing-build'
  );
  assert.equal(buildOrderViolation(wrap([prepare])), 'no-playwright-steps');
  assert.equal(buildOrderViolation(wrap([gate, prepare])), 'build-after-playwright');
  assert.equal(buildOrderViolation(wrap([prepare, gate])), null);
});
