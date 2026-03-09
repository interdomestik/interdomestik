import assert from 'node:assert/strict';
import test from 'node:test';

import packageJson from '../package.json' with { type: 'json' };
import databasePackageJson from '../packages/database/package.json' with { type: 'json' };
import webPackageJson from '../apps/web/package.json' with { type: 'json' };

test('e2e gate scripts keep full and fast lanes distinct', () => {
  const stateSetup = packageJson.scripts['e2e:state:setup'];
  const fullGate = packageJson.scripts['e2e:gate'];
  const fastGate = packageJson.scripts['e2e:gate:fast'];
  const prGate = packageJson.scripts['e2e:gate:pr'];
  const prGateFast = packageJson.scripts['e2e:gate:pr:fast'];
  const fastCheck = packageJson.scripts['check:fast'];

  assert.equal(typeof stateSetup, 'string');
  assert.match(stateSetup, /setup\.state\.spec\.ts/);
  assert.match(stateSetup, /--project=setup-ks/);
  assert.match(stateSetup, /--project=setup-mk/);

  assert.match(fullGate, /pnpm e2e:state:setup/);
  assert.match(fullGate, /PW_FAST_GATES=1/);
  assert.match(fullGate, /--project=gate-ks-sq/);
  assert.match(fullGate, /--project=gate-mk-mk/);
  assert.doesNotMatch(fullGate, /--project=gate-mk-contract/);

  assert.match(fastGate, /PW_FAST_GATES=1/);
  assert.match(fastGate, /--project=gate-ks-sq/);
  assert.match(fastGate, /--project=gate-mk-mk/);
  assert.doesNotMatch(fastGate, /--project=gate-mk-contract/);

  assert.equal(typeof prGate, 'string');
  assert.match(prGate, /pnpm e2e:state:setup/);
  assert.match(prGate, /--project=gate-ks-sq/);
  assert.match(prGate, /--project=gate-mk-contract/);
  assert.doesNotMatch(prGate, /--project=gate-mk-mk/);

  assert.equal(typeof prGateFast, 'string');
  assert.match(prGateFast, /PW_FAST_GATES=1/);
  assert.match(prGateFast, /--project=gate-ks-sq/);
  assert.match(prGateFast, /--project=gate-mk-contract/);
  assert.doesNotMatch(prGateFast, /--project=gate-mk-mk/);

  assert.equal(
    fastCheck,
    'node scripts/run-with-default-db-url.mjs pnpm e2e:state:setup && node scripts/run-with-default-db-url.mjs pnpm e2e:gate:pr:fast'
  );
  assert.notEqual(fullGate, fastGate);
  assert.notEqual(prGate, prGateFast);
});

test('web package exposes full and PR gate lanes separately', () => {
  const fullGate = webPackageJson.scripts['e2e:gate'];
  const fastGate = webPackageJson.scripts['e2e:gate:fast'];
  const prGate = webPackageJson.scripts['e2e:gate:pr'];
  const prGateFast = webPackageJson.scripts['e2e:gate:pr:fast'];

  assert.match(fullGate, /--project=gate-ks-sq/);
  assert.match(fullGate, /--project=gate-mk-mk/);
  assert.doesNotMatch(fullGate, /--project=gate-mk-contract/);

  assert.match(fastGate, /--project=gate-ks-sq/);
  assert.match(fastGate, /--project=gate-mk-mk/);
  assert.doesNotMatch(fastGate, /--project=gate-mk-contract/);

  assert.match(prGate, /--project=gate-ks-sq/);
  assert.match(prGate, /--project=gate-mk-contract/);
  assert.doesNotMatch(prGate, /--project=gate-mk-mk/);

  assert.match(prGateFast, /--project=gate-ks-sq/);
  assert.match(prGateFast, /--project=gate-mk-contract/);
  assert.doesNotMatch(prGateFast, /--project=gate-mk-mk/);
});

test('root package exposes the scripts/ci contract suite', () => {
  assert.equal(packageJson.scripts['test:ci:contracts'], 'node --test scripts/ci/*.test.mjs');
});

test('root package exposes the D07 Sentry alert management scripts', () => {
  assert.equal(packageJson.scripts['sentry:alerts:check'], 'node scripts/sentry-alerts.mjs check');
  assert.equal(packageJson.scripts['sentry:alerts:apply'], 'node scripts/sentry-alerts.mjs apply');
});

test('database package keeps a dedicated critical-table RLS verification in the canonical RLS suite', () => {
  const rlsSuite = databasePackageJson.scripts['test:rls'];

  assert.equal(typeof rlsSuite, 'string');
  assert.match(rlsSuite, /test\/critical-rls-tables\.test\.ts/);
});
