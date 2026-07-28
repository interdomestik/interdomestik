import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

import { validatePreimageReceipt } from './configure-vercel-gate-url.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => yaml.load(fs.readFileSync(path.join(root, file), 'utf8'));
const cd = read('.github/workflows/cd.yml');
const action = read('.github/actions/trigger-digest-verified-deploy/action.yml');
const configure = fs.readFileSync(
  path.join(root, 'scripts/ci/configure-vercel-gate-url.mjs'),
  'utf8'
);
const rollback = cd.jobs['rollback-staging-alias'];
const rollbackIf = rollback.if;
const findStep = (steps, name) => steps.find(step => step?.name === name);
const stepIndex = (steps, name) => steps.findIndex(step => step?.name === name);
const scheduled = ({ cancelled = false, deploy = 'success', e2e = 'success' }) =>
  !cancelled && (deploy === 'failure' || e2e === 'failure');
const receipt = aliasMoved => ({
  version: 1,
  alias: 'staging.interdomestik.com',
  deploymentHostname: 'interdomestik-old.vercel.app',
  commitSha: 'a'.repeat(40),
  aliasMoved,
});

test('CD build digests remain wired into staging and production deploys', () => {
  for (const name of ['build-staging', 'build-production']) {
    assert.equal(cd.jobs[name].outputs.image_digest, '${{ steps.build.outputs.digest }}');
  }
});

test('provider and database credentials stay job/action scoped', () => {
  for (const key of [
    'DATABASE_URL',
    'DATABASE_URL_RLS',
    'VERCEL_ORG_ID',
    'VERCEL_PROJECT_ID',
    'VERCEL_TOKEN',
  ])
    assert.equal(cd.env[key], undefined);
});

test('deploy action exports rollback controls without expanding historical job outputs', () => {
  const deploy = findStep(action.runs.steps, 'Deploy Vercel artifact');
  assert.match(deploy.run, /configure-vercel-gate-url\.mjs/u);
  for (const output of [
    'alias_moved',
    'gate_base_url',
    'gate_hostname',
    'previous_commit_sha',
    'previous_deployment_hostname',
  ])
    assert.match(action.outputs[output].value, new RegExp(`steps\\.deploy\\.outputs\\.${output}`));
  assert.deepEqual(cd.jobs['deploy-staging'].outputs, {
    alias_moved: '${{ steps.vercel.outputs.alias_moved }}',
    base_url: '${{ steps.vercel.outputs.base_url }}',
    hostname: '${{ steps.vercel.outputs.hostname }}',
    gate_base_url: '${{ steps.vercel.outputs.gate_base_url }}',
    gate_hostname: '${{ steps.vercel.outputs.gate_hostname }}',
  });
});

test('preimage is uploaded before checks and atomically confirms alias movement', () => {
  const steps = cd.jobs['deploy-staging'].steps;
  const upload = findStep(steps, 'Upload staging alias preimage receipt');
  const download = findStep(rollback.steps, 'Download staging alias preimage receipt');
  const deployReceipt = cd.jobs['deploy-staging'].env.STAGING_PREIMAGE_RECEIPT_PATH;
  const downloadedReceipt = `${download.with.path}/${path.posix.basename(deployReceipt)}`;
  const deployIndex = stepIndex(steps, 'Deploy Staging to Vercel');
  const uploadIndex = stepIndex(steps, upload.name);
  const healthIndex = stepIndex(steps, 'Wait for Staging Health');
  assert.ok(deployIndex < uploadIndex && uploadIndex < healthIndex);
  assert.equal(upload.with.name, download.with.name);
  assert.equal(upload.with.path, '${{ env.STAGING_PREIMAGE_RECEIPT_PATH }}');
  assert.equal(rollback.env.STAGING_PREIMAGE_RECEIPT_PATH, downloadedReceipt);
  assert.match(upload.if, /always\(\)/u);
  assert.doesNotMatch(upload.if, /alias_moved/u);
  assert.equal(upload.with['if-no-files-found'], 'ignore');
  const snapshot = configure.indexOf('aliasMoved: false');
  const assignment = configure.indexOf('await aliasStagingDeployment', snapshot);
  const moved = configure.indexOf('aliasMoved: true', assignment);
  assert.ok(snapshot < assignment && assignment < moved);
});

test('post-alias red deploy job restores only from a confirmed receipt', () => {
  assert.equal(scheduled({ deploy: 'failure', e2e: 'skipped' }), true);
  assert.equal(validatePreimageReceipt(receipt(true)).aliasMoved, true);
  assert.match(rollbackIf, /deploy-staging\.result == 'failure'/u);
  assert.doesNotMatch(rollbackIf, /outputs\.gate_hostname/u);
});

test('pre-alias failure reaches a local guard but never the provider restore', () => {
  assert.equal(scheduled({ deploy: 'failure', e2e: 'skipped' }), true);
  assert.equal(validatePreimageReceipt(receipt(false)).aliasMoved, false);
  assert.throws(
    () =>
      validatePreimageReceipt({
        ...receipt(false),
        deploymentHostname: 'https://interdomestik-old.vercel.app/path',
      }),
    /invalid staging alias preimage receipt/u
  );
  const guard = findStep(rollback.steps, 'Validate staging alias rollback authority');
  const restore = findStep(rollback.steps, 'Restore exact staging alias preimage');
  assert.match(guard.if, /always\(\)/u);
  assert.match(guard.run, /configure-vercel-gate-url\.mjs guard/u);
  assert.equal(guard.env?.VERCEL_TOKEN, undefined);
  assert.match(restore.if, /rollback_guard\.outputs\.should_restore == 'true'/u);
});

test('failed staging E2E after confirmed movement schedules restore', () => {
  assert.equal(scheduled({ e2e: 'failure' }), true);
  assert.equal(validatePreimageReceipt(receipt(true)).aliasMoved, true);
  assert.match(rollbackIf, /e2e-staging\.result == 'failure'/u);
});

test('cancellation freezes staging and successful E2E skips rollback', () => {
  assert.equal(scheduled({ cancelled: true, deploy: 'failure' }), false);
  assert.equal(scheduled({}), false);
  assert.match(rollbackIf, /always\(\).*!\s*cancelled\(\)/su);
});

test('restore credentials are scoped and failure receipt always uploads hard red', () => {
  const restore = findStep(rollback.steps, 'Restore exact staging alias preimage');
  const upload = findStep(rollback.steps, 'Upload staging alias rollback receipt');
  assert.match(restore.env.VERCEL_TOKEN, /secrets\.VERCEL_TOKEN/u);
  assert.equal(restore['continue-on-error'], undefined);
  assert.match(upload.if, /always\(\)/u);
  assert.equal(upload['continue-on-error'], undefined);
  assert.equal(upload.with['if-no-files-found'], 'error');
});

test('ordinary pushes still skip every production job', () => {
  for (const name of [
    'production-evidence',
    'build-production',
    'deploy-production',
    'verify-production',
  ]) {
    assert.match(cd.jobs[name].if, /refs\/tags\/v|workflow_dispatch/u);
    assert.doesNotMatch(cd.jobs[name].if, /refs\/heads\/main/u);
  }
});
