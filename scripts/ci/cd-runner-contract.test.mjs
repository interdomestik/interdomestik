import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import yaml from 'js-yaml';
import { guardRollback } from './configure-vercel-gate-url.mjs';
const root = path.resolve(new URL('../../', import.meta.url).pathname);
const readText = file => fs.readFileSync(path.join(root, file), 'utf8');
const readWorkflow = file => yaml.load(readText(file));
const cd = yaml.load(readText('.github/workflows/cd.yml'));
const staging = ['build-staging', 'deploy-staging', 'e2e-staging', 'rollback-staging-alias'];
const production = ['build-production', 'deploy-production', 'verify-production'];
const guarded = [...staging, 'production-evidence', ...production];
const stepIndex = (job, matcher) =>
  job.steps.findIndex(step => matcher.test(step.name || step.uses || step.run || ''));
const step = (job, name) => job.steps.find(candidate => candidate.name === name);
const findStep = (steps, name) => steps.find(candidate => candidate.name === name);
const findStepIndex = (steps, name) => {
  const index = steps.findIndex(candidate => candidate.name === name);
  assert.notEqual(index, -1, `Missing step: ${name}`);
  return index;
};
const normalizeNeeds = needs =>
  Array.isArray(needs) ? needs : typeof needs === 'string' ? [needs] : [];
test('allocates only staging execution to the exclusive Z620 runner', () => {
  for (const name of staging)
    assert.deepEqual(cd.jobs[name]['runs-on'], ['self-hosted', 'interdomestik-z620-staging']);
  assert.equal(cd.jobs['production-evidence']['runs-on'], 'ubuntu-latest');
  for (const name of production)
    assert.deepEqual(cd.jobs[name]['runs-on'], ['self-hosted', 'interdomestik-mac']);
  assert.deepEqual(cd.jobs['production-evidence'].needs, ['scope', 'e2e-staging']);
});
test('hosted scope is the direct fail-closed predecessor of every capable job', () => {
  const scope = cd.jobs.scope;
  assert.equal(scope['runs-on'], 'ubuntu-latest');
  assert.deepEqual(scope.permissions, { actions: 'read', contents: 'read' });
  assert.equal(scope.outputs.deploy, '${{ steps.classify.outputs.deploy }}');
  assert.equal(scope.outputs.receipt_sha256, '${{ steps.classify.outputs.receipt_sha256 }}');
  const checkout = step(scope, 'Checkout exact event range');
  const classify = step(scope, 'Classify deployment scope');
  const upload = step(scope, 'Upload exact scope receipt');
  assert.deepEqual(checkout.with, { 'fetch-depth': 0, ref: '${{ github.sha }}' });
  assert.equal(scope.env, undefined);
  for (const pattern of [
    /set -euo pipefail/u,
    /ba9da7ff8b13ceb1f1bc64864a40045ce4a79051/u,
    /\/usr\/bin\/git cat-file -e "\$\{CD_BEFORE\}\^\{commit\}"/u,
    /\/usr\/bin\/git show "\$\{CD_BEFORE\}:\$\{current_guard\}"/u,
    /tmp\/cd-evidence\/trusted-parent-guard\.mjs/u,
    /set -o noclobber/u,
    /node "\$\{trusted_guard\}" >> "\$\{GITHUB_OUTPUT\}"/u,
    /node "\$\{current_guard\}" >> "\$\{GITHUB_OUTPUT\}"/u,
  ])
    assert.match(classify.run, pattern);
  assert.equal(classify.env.CD_BEFORE, '${{ github.event.before || github.sha }}');
  assert.equal(classify.env.CD_AFTER, '${{ github.event.after || github.sha }}');
  for (const value of [upload.with.path, upload.with.name]) {
    assert.match(value, /github\.run_id/u);
    assert.match(value, /github\.run_attempt/u);
    assert.match(value, /github\.sha/u);
  }
  assert.match(upload.with.path, /^tmp\/cd-evidence\//u);
  assert.match(upload.if, /always\(\)/u);
  assert.equal(upload.with['if-no-files-found'], 'error');
  for (const name of guarded) {
    const job = cd.jobs[name];
    const needs = Array.isArray(job.needs) ? job.needs : [job.needs];
    assert.ok(needs.includes('scope'), `${name} must directly need scope`);
    assert.match(job.if, /needs\.scope\.result == 'success'/u);
    assert.match(job.if, /needs\.scope\.outputs\.deploy == 'true'/u);
  }
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
  assert.equal(buildx.with.cleanup, true);
  const verifyBuilder = step(cd.jobs['build-staging'], 'Verify dedicated Docker builder');
  assert.match(verifyBuilder.run, /cd-runner-preflight\.mjs verify-builder/u);
  assert.equal(stepIndex(cd.jobs['build-staging'], /Verify dedicated Docker builder/u), 3);
  assert.equal(step(cd.jobs['build-staging'], 'Prune stale dedicated build cache'), undefined);
});
test('generates staging image metadata offline from exact trusted inputs', () => {
  const build = cd.jobs['build-staging'];
  const metadata = step(build, 'Generate deterministic image metadata');
  assert.match(metadata.run, /set -euo pipefail/u);
  assert.match(metadata.run, /GITHUB_SHA.*\^\[a-f0-9\]\{40\}\$/u);
  assert.match(metadata.run, /REGISTRY.*ghcr\.io/u);
  assert.match(metadata.run, /IMAGE_NAME.*GITHUB_REPOSITORY/u);
  assert.match(metadata.run, /GITHUB_SERVER_URL.*https:\/\/github\.com/u);
  assert.match(metadata.run, /tags=.*REGISTRY.*IMAGE_NAME.*version/u);
  assert.match(metadata.run, /org\.opencontainers\.image\.(source|revision|version)/u);
  assert.match(metadata.run, /GITHUB_OUTPUT/u);
  const hasMetadataAction = build.steps.some(candidate =>
    /docker\/metadata-action@/u.test(candidate.uses || '')
  );
  assert.equal(hasMetadataAction, false);
  const buildProduction = cd.jobs['build-production'];
  const productionMetadata = step(buildProduction, 'Extract metadata (tags, labels) for Docker');
  assert.match(productionMetadata.uses, /^docker\/metadata-action@[a-f0-9]{40}$/u);
});
test('propagates alias movement independently and always reaches the local guard', () => {
  const deploy = cd.jobs['deploy-staging'];
  const rollback = cd.jobs['rollback-staging-alias'];
  assert.equal(deploy.outputs.alias_moved, '${{ steps.vercel.outputs.alias_moved }}');
  const download = step(rollback, 'Download staging alias preimage receipt');
  assert.equal(download['continue-on-error'], true);
  const guard = step(rollback, 'Validate staging alias rollback authority');
  const aliasMovedSignal = guard.env.STAGING_ALIAS_MOVED_SIGNAL;
  assert.equal(aliasMovedSignal, '${{ needs.deploy-staging.outputs.alias_moved }}');
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
  const destructivePrune = /docker\s+system\s+prune|docker\s+(image|volume|container)\s+prune/u;
  assert.doesNotMatch(preflight, destructivePrune);
});
test('OD17 collector keeps OIDC out of the unprivileged exact-head job', () => {
  const workflow = readWorkflow('.github/workflows/od17-preview-canary.yml');
  const ci = readWorkflow('.github/workflows/ci.yml');
  const prepare = workflow.jobs['prepare-exact-head'];
  const trusted = workflow.jobs['trusted-main-collector'];
  const audit = ci.jobs.audit;
  const proofStep = findStep(audit.steps, 'Certify OD17 exact-head public shell');
  const upload = findStep(audit.steps, 'Upload OD17 exact-head verdict');
  const checkout = audit.steps.find(step => String(step?.uses).startsWith('actions/checkout@'));
  assert.ok(proofStep);
  assert.ok(upload);
  assert.ok(checkout);
  assert.equal(proofStep.run, 'pnpm od17:verify');
  assert.equal(proofStep['continue-on-error'], undefined);
  assert.equal(proofStep.env.EXPECTED_HEAD_SHA, '${{ github.event.pull_request.head.sha }}');
  const expectedTrustedSha = '${{ github.event.pull_request.base.sha }}';
  assert.equal(proofStep.env.EXPECTED_TRUSTED_MAIN_SHA, expectedTrustedSha);
  for (const value of [checkout.with.ref, proofStep.if, upload.if]) {
    assert.match(value, /head\.repo\.full_name == github\.repository/u);
  }
  assert.match(checkout.with.ref, /pull_request\.head\.sha[\s\S]*github\.sha/u);
  assert.match(upload.if, /always\(\)/u);
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.deepEqual(Object.keys(workflow.jobs), ['prepare-exact-head', 'trusted-main-collector']);
  assert.equal(prepare.permissions['id-token'], 'none');
  const build = findStep(prepare.steps, 'Build exact head and retain bounded structural evidence');
  assert.ok(build);
  assert.notEqual(build.env.DATABASE_URL_RLS, build.env.DATABASE_URL);
  assert.doesNotMatch(build.run, /app-build-manifest/u);
  assert.deepEqual(
    [trusted.permissions['id-token'], trusted.permissions.actions, trusted.permissions.deployments],
    ['write', 'read', 'read']
  );
  assert.equal(workflow.permissions, undefined);
  const untrustedEvidence = findStep(
    prepare.steps,
    'Collect authenticated exact-deployment evidence'
  );
  assert.equal(untrustedEvidence, undefined);
  assert.ok(findStep(trusted.steps, 'Resolve exact PR preparation run and Preview'));
  assert.ok(findStep(trusted.steps, 'Collect authenticated exact-deployment evidence'));
  const structural = findStep(trusted.steps, 'Recompute untrusted local structural evidence');
  const sourcePattern = /const safeAssetPath = (value => \{[\s\S]*?\n\s*\});/u;
  const source = structural?.run?.match(sourcePattern)?.[1];
  assert.ok(source);
  const safeAssetPath = vm.runInNewContext(`(${source})`, {}, { timeout: 50 });
  for (const value of ['static/(public)/[locale].js', 'static/%5Blocale%5D.js']) {
    assert.equal(safeAssetPath(value), true, value);
  }
  for (const value of ['static/../x.js', 'static/%2e/x.js', 'static/%2f.js', 'static/%ZZ.js']) {
    assert.equal(safeAssetPath(value), false, value);
  }
  assert.match(structural.run, /item === null \|\| typeof item !== 'object'/u);
});
test('CI delegates PR browser gate to PR E2E', () => {
  const ciWorkflow = readWorkflow('.github/workflows/ci.yml');
  const prE2eWorkflow = readWorkflow('.github/workflows/e2e-pr.yml');
  const validationSurfaceJob = ciWorkflow.jobs['validation-surface'];
  assert.ok(validationSurfaceJob);
  const ciE2eGateJob = ciWorkflow.jobs['e2e-gate'];
  const ciSteps = ciE2eGateJob.steps;
  const ciE2eNeeds = normalizeNeeds(ciE2eGateJob.needs);
  assert.ok(ciE2eNeeds.includes('validation-surface'));
  assert.equal(ciE2eGateJob.if, "needs.validation-surface.outputs.run_broad == 'true'");
  const setupStep = ciSteps.find(step => step?.uses === './.github/actions/setup');
  assert.equal(setupStep.with['install-playwright'], "${{ github.event_name != 'pull_request' }}");
  const strictGuardStep = findStep(ciSteps, 'Enforce E2E Best Practices');
  assert.equal(strictGuardStep.if, "github.event_name != 'pull_request'");
  assert.match(strictGuardStep.run, /guards/u);
  const prepareDbStep = findStep(ciSteps, 'Prepare E2E Database');
  assert.equal(prepareDbStep.if, undefined);
  const rlsStep = findStep(ciSteps, 'RLS Integration Test');
  assert.equal(rlsStep.if, undefined);
  const e2eGateSuiteStep = findStep(ciSteps, 'E2E Gate Suite');
  const mainE2eOnly =
    "github.event_name != 'pull_request' && needs.validation-surface.outputs.main_e2e_reuse != '1'";
  assert.equal(e2eGateSuiteStep.if, mainE2eOnly);
  for (const lane of ['static', 'unit']) {
    const job = ciWorkflow.jobs[lane];
    assert.ok(normalizeNeeds(job.needs).includes('validation-surface'));
    assert.equal(job.if, "needs.validation-surface.outputs.run_broad == 'true'");
  }
  const prE2eJob = prE2eWorkflow.jobs['e2e-runner'];
  const prE2eSetupStep = prE2eJob.steps.find(step => step?.uses === './.github/actions/setup');
  assert.equal(prE2eSetupStep.with['install-playwright'], true);
  const prStrictGuardStep = findStep(prE2eJob.steps, 'Strict Rule Guards (golden/gate)');
  assert.match(prStrictGuardStep.run, /guards/u);
  const prGateStep = findStep(prE2eJob.steps, 'Run PR E2E Gate');
  assert.equal(prGateStep.run, 'pnpm e2e:gate:pr');
  assert.equal(findStep(prE2eJob.steps, 'Generate Playwright Gate Auth State (KS+MK)'), undefined);
  assert.equal(findStep(prE2eJob.steps, 'E2E Subscription Lifecycle (KS+MK)'), undefined);
  assert.equal(findStep(prE2eJob.steps, 'E2E Smoke Suite (KS+MK)'), undefined);
});
test('CI unit lane runs the blocking repository coverage gate', () => {
  const ciWorkflow = readWorkflow('.github/workflows/ci.yml');
  const unitJob = ciWorkflow.jobs.unit;
  assert.ok(unitJob);
  assert.ok(normalizeNeeds(unitJob.needs).includes('validation-surface'));
  assert.equal(unitJob.if, "needs.validation-surface.outputs.run_broad == 'true'");
  const coverageStep = findStep(unitJob.steps, 'Coverage Gate');
  assert.ok(coverageStep);
  assert.equal(coverageStep.run, 'pnpm coverage:gate');
});
test('Pilot gate heavy runner depends on preflight before Postgres, setup, build, and release-gate work', () => {
  const pilotGateWorkflow = readWorkflow('.github/workflows/pilot-gate.yml');
  const pilotGateJob = pilotGateWorkflow.jobs['pilot-gate-runner'];
  assert.ok(pilotGateJob);
  const steps = pilotGateJob.steps;
  const setupIndex = steps.findIndex(step => step?.uses === './.github/actions/setup');
  const manualSonarIndex = findStepIndex(steps, 'Run Sonar quality gate (manual fallback)');
  const prepareDbIndex = findStepIndex(steps, 'Prepare CI database');
  const buildIndex = findStepIndex(steps, 'Build web standalone artifact');
  assert.deepEqual(normalizeNeeds(pilotGateJob.needs), ['pilot-gate-preflight']);
  assert.equal(pilotGateJob.if, "needs.pilot-gate-preflight.outputs.run_broad == 'true'");
  assert.equal(pilotGateJob.env.DATABASE_URL_RLS, pilotGateJob.env.DATABASE_URL);
  assert.equal(pilotGateJob.env.NODE_OPTIONS, '--max-old-space-size=4096');
  for (const index of [setupIndex, manualSonarIndex, prepareDbIndex, buildIndex]) {
    assert.ok(index >= 0);
  }
  assert.equal(
    findStep(steps, 'Run Sonar quality gate (manual fallback)').if,
    "env.SONAR_GATE_ENABLED == 'true' && (github.event_name != 'pull_request' || needs.pilot-gate-preflight.outputs.needs_manual_sonar_fallback == 'true')"
  );
  assert.ok(setupIndex < prepareDbIndex);
  assert.ok(manualSonarIndex < prepareDbIndex);
  assert.ok(manualSonarIndex < buildIndex);
  assert.equal(findStep(steps, 'Evaluate validation surface'), undefined);
  assert.equal(findStep(steps, 'Validate required gate secrets'), undefined);
  assert.equal(findStep(steps, 'Await SonarCloud Code Analysis check'), undefined);
});
