import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// Without a build before the first Playwright step, the web server (scripts/e2e-webserver.sh)
// builds the app lazily inside Playwright's 300 s start timeout, which a cold CI build overruns.
// The early build must see the same inlined public values as that lazy build.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readText = file => fs.readFileSync(path.join(root, file), 'utf8');
const BUILD_STEP = 'Seed E2E DB and build the app artifact';
// Closed list: any other step before the build (a Playwright run under any script name) fails.
const ALLOWED_BEFORE_BUILD = Object.freeze([
  'Checkout',
  'Setup',
  'Generate ephemeral E2E credentials',
  'DB migrations',
  'Strict Rule Guards (golden/gate)',
]);
const PLAYWRIGHT_RUN = /playwright|e2e:state:setup|e2e:gate|test:e2e|test:smoke/u;

function scriptDefault(name) {
  const prefix = `${name}="`;
  const line = readText('scripts/e2e-webserver.sh')
    .split('\n')
    .map(text => text.trim())
    .find(text => text.startsWith(prefix) && text.endsWith('"'));
  assert.ok(line, `scripts/e2e-webserver.sh no longer defines ${name}`);
  return line.slice(prefix.length, -1);
}

function expectedBuildLine() {
  const config = readText('apps/web/playwright.config.ts');
  assert.match(config, /NEXT_PUBLIC_SENTRY_DSN: '',/u);
  assert.match(config, /envOrFallback\('NEXT_PUBLIC_PADDLE_ENV', 'sandbox'\)/u);
  return [
    'env -u PLAYWRIGHT -u INTERDOMESTIK_AUTOMATED',
    `NEXT_PUBLIC_SUPABASE_URL=${scriptDefault('LOCAL_SUPABASE_URL')}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${scriptDefault('LOCAL_SUPABASE_ANON_KEY')}`,
    'NEXT_PUBLIC_PADDLE_ENV=sandbox',
    'NEXT_PUBLIC_SENTRY_DSN=',
    'pnpm --filter @interdomestik/web run build:ci',
  ].join(' ');
}

function buildOrderViolation(workflow, buildLine) {
  const steps = workflow?.jobs?.e2e?.steps ?? [];
  const buildIndex = steps.findIndex(step => step?.name === BUILD_STEP);
  if (buildIndex === -1) return 'missing-build-step';
  const buildStep = steps[buildIndex];
  if (buildStep.if !== undefined) return 'build-not-on-every-shard';
  const lines = (buildStep.run ?? '').split('\n').map(line => line.trim());
  if (!lines.includes(buildLine)) return 'missing-build';
  const before = steps.slice(0, buildIndex);
  if (before.some(step => !ALLOWED_BEFORE_BUILD.includes(step?.name)))
    return 'unknown-step-before-build';
  if (before.some(step => PLAYWRIGHT_RUN.test(step?.run ?? ''))) return 'playwright-before-build';
  const after = steps.slice(buildIndex + 1);
  return after.some(step => PLAYWRIGHT_RUN.test(step?.run ?? '')) ? null : 'no-playwright-steps';
}

const BUILD_LINE = 'pnpm --filter @interdomestik/web run build:ci';
const build = { name: BUILD_STEP, run: `pnpm seed:e2e\n${BUILD_LINE}\n` };
const gate = { name: 'E2E Gate', run: 'pnpm --filter @interdomestik/web run e2e:gate' };
const authState = {
  name: 'Auth state',
  run: 'pnpm --filter @interdomestik/web test:e2e -- e2e/setup.state.spec.ts',
};
const wrap = steps => ({ jobs: { e2e: { steps } } });
const violation = steps => buildOrderViolation(wrap(steps), BUILD_LINE);

test('Nightly E2E builds the app, as the lazy web-server build would, before every Playwright step', () => {
  const workflow = yaml.load(readText('.github/workflows/e2e-nightly.yml'));
  assert.equal(buildOrderViolation(workflow, expectedBuildLine()), null);
  const steps = workflow.jobs.e2e.steps;
  assert.ok(steps.filter(step => PLAYWRIGHT_RUN.test(step.run ?? '')).length >= 4);
});

test('Nightly build order refuses a missing, partial, late or shard-limited build', () => {
  assert.equal(buildOrderViolation(undefined, BUILD_LINE), 'missing-build-step');
  assert.equal(violation([gate]), 'missing-build-step');
  assert.equal(
    violation([{ ...build, if: 'matrix.shardIndex == 1' }, gate]),
    'build-not-on-every-shard'
  );
  assert.equal(violation([{ ...build, run: '' }, gate]), 'missing-build');
  assert.equal(violation([{ ...build, run: `# ${BUILD_LINE}` }, gate]), 'missing-build');
  assert.equal(
    violation([{ ...build, run: 'pnpm --filter @interdomestik/web run build' }, gate]),
    'missing-build'
  );
  assert.equal(violation([gate, build]), 'unknown-step-before-build');
  assert.equal(violation([authState, build, gate]), 'unknown-step-before-build');
  assert.equal(
    violation([{ name: 'Setup', run: 'pnpm exec playwright install' }, build, gate]),
    'playwright-before-build'
  );
  assert.equal(violation([build]), 'no-playwright-steps');
  assert.equal(violation([{ name: 'Checkout' }, build, authState]), null);
  assert.equal(violation([build, gate]), null);
});
