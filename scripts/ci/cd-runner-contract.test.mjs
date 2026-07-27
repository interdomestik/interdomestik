import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

import { guardRollback } from './configure-vercel-gate-url.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readText = file => fs.readFileSync(path.join(root, file), 'utf8');
const cd = yaml.load(readText('.github/workflows/cd.yml'));
const staging = ['build-staging', 'deploy-staging', 'e2e-staging', 'rollback-staging-alias'];
const production = ['build-production', 'deploy-production', 'verify-production'];
const stepIndex = (job, matcher) =>
  job.steps.findIndex(step => matcher.test(step.name || step.uses || step.run || ''));
const step = (job, name) => job.steps.find(candidate => candidate.name === name);

test('allocates only staging execution to the exclusive Z620 runner', () => {
  for (const name of staging)
    assert.deepEqual(cd.jobs[name]['runs-on'], ['self-hosted', 'interdomestik-z620-staging']);
  assert.equal(cd.jobs['production-evidence']['runs-on'], 'ubuntu-latest');
  for (const name of production)
    assert.deepEqual(cd.jobs[name]['runs-on'], ['self-hosted', 'interdomestik-mac']);
  assert.equal(cd.jobs['production-evidence'].needs, 'e2e-staging');
});

test('preflights every staging job directly after checkout and bounds heavy jobs', () => {
  for (const name of staging) {
    const job = cd.jobs[name];
    const checkout = stepIndex(job, /actions\/checkout/u);
    const preflight = stepIndex(job, /cd-runner-preflight\.mjs/u);
    assert.equal(preflight, checkout + 1, `${name} must preflight directly after checkout`);
  }
  assert.equal(cd.jobs['build-staging']['timeout-minutes'], 45);
  assert.equal(cd.jobs['e2e-staging']['timeout-minutes'], 30);
  const buildx = step(cd.jobs['build-staging'], 'Set up Docker Buildx');
  assert.equal(buildx.with.name, 'interdomestik-cd-staging');
  assert.equal(buildx.with['keep-state'], true);
  assert.equal(buildx.with.cleanup, false);
  const verifyBuilder = step(cd.jobs['build-staging'], 'Verify dedicated Docker builder');
  assert.match(verifyBuilder.run, /cd-runner-preflight\.mjs verify-builder/u);
  assert.equal(stepIndex(cd.jobs['build-staging'], /Verify dedicated Docker builder/u), 3);
  const pruneBuilder = step(cd.jobs['build-staging'], 'Prune stale dedicated build cache');
  assert.match(pruneBuilder.if, /always\(\).*!\s*cancelled\(\)/u);
  assert.match(pruneBuilder.run, /cd-runner-preflight\.mjs prune/u);
  assert.equal(
    stepIndex(cd.jobs['build-staging'], /Prune stale dedicated build cache/u),
    cd.jobs['build-staging'].steps.length - 1
  );
});

test('propagates alias movement independently and always reaches the local guard', () => {
  const deploy = cd.jobs['deploy-staging'];
  const rollback = cd.jobs['rollback-staging-alias'];
  assert.equal(deploy.outputs.alias_moved, '${{ steps.vercel.outputs.alias_moved }}');
  const download = step(rollback, 'Download staging alias preimage receipt');
  assert.equal(download['continue-on-error'], true);
  const guard = step(rollback, 'Validate staging alias rollback authority');
  assert.equal(
    guard.env.STAGING_ALIAS_MOVED_SIGNAL,
    '${{ needs.deploy-staging.outputs.alias_moved }}'
  );
  assert.match(guard.if, /always\(\)/u);
});

async function withRollbackEnv(aliasMoved, contents, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-rollback-'));
  const before = { ...process.env };
  process.env.STAGING_PREIMAGE_RECEIPT_PATH = path.join(directory, 'preimage.json');
  process.env.STAGING_ROLLBACK_RECEIPT_PATH = path.join(directory, 'rollback.json');
  process.env.STAGING_ALIAS_MOVED_SIGNAL = aliasMoved;
  if (contents !== undefined)
    fs.writeFileSync(process.env.STAGING_PREIMAGE_RECEIPT_PATH, contents, { mode: 0o600 });
  try {
    await callback(process.env.STAGING_ROLLBACK_RECEIPT_PATH);
  } finally {
    process.env = before;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('missing preimage is not-required only when movement is unconfirmed', async () => {
  await withRollbackEnv('false', undefined, async rollbackPath => {
    assert.equal(await guardRollback(), false);
    assert.equal(JSON.parse(fs.readFileSync(rollbackPath, 'utf8')).outcome, 'not-required');
  });
});

test('missing preimage after confirmed movement remains hard red', async () => {
  await withRollbackEnv('true', undefined, async rollbackPath => {
    await assert.rejects(() => guardRollback(), /confirmed alias movement.*preimage/u);
    assert.equal(JSON.parse(fs.readFileSync(rollbackPath, 'utf8')).outcome, 'failed');
  });
});

test('malformed preimage remains hard red regardless of movement signal', async () => {
  await withRollbackEnv('false', '{', async rollbackPath => {
    await assert.rejects(() => guardRollback(), /JSON|position|unexpected/iu);
    assert.equal(JSON.parse(fs.readFileSync(rollbackPath, 'utf8')).outcome, 'failed');
  });
});

test('exclusive label does not activate pre-claimed Linux workflows', () => {
  for (const file of [
    '.github/workflows/release-candidate.yml',
    '.github/workflows/multi-agent-benchmark-weekly.yml',
  ]) {
    const source = readText(file);
    assert.match(source, /interdomestik-linux/u);
    assert.doesNotMatch(source, /interdomestik-z620-staging/u);
  }
  const preflight = readText('scripts/ci/cd-runner-preflight.mjs');
  assert.doesNotMatch(
    preflight,
    /docker\s+system\s+prune|docker\s+(image|volume|container)\s+prune/u
  );
});
