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
const BUILD_PREAMBLE = 'set -euo pipefail\npnpm seed:e2e';
const STRICT_GUARDS = {
  name: 'Strict Rule Guards (golden/gate)',
  run: 'pnpm --filter @interdomestik/web run e2e:guards',
};
const ALLOWED_BEFORE_BUILD = Object.freeze([
  { name: 'Checkout', uses: 'actions/checkout@v5' },
  { name: 'Setup', uses: './.github/actions/setup' },
  { name: 'Generate ephemeral E2E credentials', run: 'bash scripts/ci/export-e2e-credentials.sh' },
  { name: 'DB migrations', run: 'pnpm db:migrate' },
  STRICT_GUARDS,
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
  assert.ok(config.includes("NEXT_PUBLIC_SENTRY_DSN: '',"), 'Sentry DSN must be empty');
  assert.ok(
    config.includes("envOrFallback('NEXT_PUBLIC_PADDLE_ENV', 'sandbox')"),
    'Paddle must default to sandbox'
  );
  assert.ok(
    config.includes(
      String.raw`RAW_PADDLE_ENV.split(/\s+/)[0] === 'production' ? 'production' : 'sandbox';`
    ),
    'Playwright must retain the Paddle normalization expression'
  );
  assert.ok(
    config.includes('process.env.NEXT_PUBLIC_PADDLE_ENV = NORMALIZED_PADDLE_ENV;'),
    'Playwright must assign the normalized Paddle environment'
  );
  return [
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
  const { if: condition, run } = steps[buildIndex];
  if (condition !== undefined) return 'build-not-on-every-shard';
  if (
    typeof run !== 'string' ||
    run
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n') !== `${BUILD_PREAMBLE}\n${buildLine}`
  )
    return 'build-step-not-exact';
  if (
    buildIndex !== ALLOWED_BEFORE_BUILD.length ||
    ALLOWED_BEFORE_BUILD.some(({ name, run, uses }, index) => {
      const step = steps[index];
      return step?.name !== name || step.run !== run || step.uses !== uses;
    })
  )
    return 'unexpected-step-before-build';
  const after = steps.slice(buildIndex + 1);
  return after.some(step => PLAYWRIGHT_RUN.test(step?.run ?? '')) ? null : 'no-playwright-steps';
}

const BUILD_LINE = 'pnpm --filter @interdomestik/web run build:ci';
const build = { name: BUILD_STEP, run: `${BUILD_PREAMBLE}\n${BUILD_LINE}\n` };
const gate = { name: 'E2E Gate', run: 'pnpm --filter @interdomestik/web run e2e:gate' };
const authState = {
  name: 'Auth state',
  run: 'pnpm --filter @interdomestik/web test:e2e -- e2e/setup.state.spec.ts',
};
const violation = (steps, predecessors = ALLOWED_BEFORE_BUILD) =>
  buildOrderViolation({ jobs: { e2e: { steps: [...predecessors, ...steps] } } }, BUILD_LINE);

test('Nightly E2E builds the app, as the lazy web-server build would, before every Playwright step', () => {
  const workflow = yaml.load(readText('.github/workflows/e2e-nightly.yml'));
  const { env, steps } = workflow.jobs.e2e;
  assert.equal(env.PLAYWRIGHT, '1');
  assert.equal(env.INTERDOMESTIK_LOCAL_E2E, '1');
  assert.equal(env.IDENTITY_PUBLIC_SIGN_UP, 'open');
  assert.equal(env.DEFAULT_PUBLIC_TENANT_ID, 'tenant_ks');
  assert.ok(
    !Object.hasOwn(env ?? {}, 'NEXT_PUBLIC_PADDLE_ENV'),
    'Nightly E2E must use the default Paddle environment'
  );
  assert.equal(buildOrderViolation(workflow, expectedBuildLine()), null);
  assert.ok(steps.filter(step => PLAYWRIGHT_RUN.test(step.run ?? '')).length >= 4);
});

test('Nightly build order refuses a missing, partial, late or shard-limited build', () => {
  assert.equal(buildOrderViolation(undefined, BUILD_LINE), 'missing-build-step');
  assert.equal(violation([gate]), 'missing-build-step');
  assert.equal(
    violation([{ ...build, if: 'matrix.shardIndex == 1' }, gate]),
    'build-not-on-every-shard'
  );
  for (const run of [
    '',
    `# ${BUILD_LINE}`,
    'pnpm --filter @interdomestik/web run build',
    `${BUILD_PREAMBLE}\n${authState.run}\n${BUILD_LINE}`,
    `${BUILD_PREAMBLE}\nif [[ "$SHARD" == 1 ]]; then\n  ${BUILD_LINE}\nfi`,
  ]) {
    assert.equal(violation([{ ...build, run }, gate]), 'build-step-not-exact', run);
  }
  assert.equal(violation([build]), 'no-playwright-steps');
  assert.equal(violation([build, authState]), null);
  assert.equal(violation([build, gate]), null);
});

test('Nightly build order requires the exact predecessor steps in order', () => {
  const [checkout, setup, ...remaining] = ALLOWED_BEFORE_BUILD;
  const smoke = 'pnpm --filter @interdomestik/web run e2e:smoke';
  const guardsWithSmoke = { ...STRICT_GUARDS, run: `${STRICT_GUARDS.run}\n${smoke}` };
  assert.equal(violation([gate, build]), 'unexpected-step-before-build');
  assert.equal(violation([authState, build, gate]), 'unexpected-step-before-build');
  assert.equal(
    violation([build, gate], [setup, checkout, ...remaining]),
    'unexpected-step-before-build'
  );
  assert.equal(
    violation([build, gate], [...ALLOWED_BEFORE_BUILD.slice(0, -1), guardsWithSmoke]),
    'unexpected-step-before-build'
  );
});
