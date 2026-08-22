import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';
import '../../apps/web/scripts/check-size.test.mjs';
import './ci-audit-rls-workflow-contracts.mjs';
const rootDir = path.resolve(new URL('../../', import.meta.url).pathname);
const TRUSTED_GATE_ACTION =
  'interdomestik/interdomestik/.github/actions/pr-gate-policy@f4b39fc4f7fed7e875363807faea11cc2c4cf717';
const nightlyMatrix = { shardIndex: [1, 2, 3], shardTotal: [3] };
function readWorkflow(relativePath) {
  const content = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
  return yaml.load(content);
}
function findStep(steps, name) {
  return steps.find(step => step?.name === name);
}
function findStepIndex(steps, name) {
  const index = steps.findIndex(step => step?.name === name);
  assert.notEqual(index, -1, `Missing step: ${name}`);
  return index;
}
const normalizeNeeds = needs =>
  Array.isArray(needs) ? needs : typeof needs === 'string' ? [needs] : [];
const RELEASE_GATE_ENV_VARS = [
  'RELEASE_GATE_MEMBER_EMAIL',
  'RELEASE_GATE_MEMBER_PASSWORD',
  'RELEASE_GATE_AGENT_EMAIL',
  'RELEASE_GATE_AGENT_PASSWORD',
  'RELEASE_GATE_OFFICE_AGENT_EMAIL',
  'RELEASE_GATE_STAFF_EMAIL',
  'RELEASE_GATE_STAFF_PASSWORD',
  'RELEASE_GATE_ADMIN_KS_EMAIL',
  'RELEASE_GATE_ADMIN_KS_PASSWORD',
  'RELEASE_GATE_ADMIN_MK_EMAIL',
  'RELEASE_GATE_ADMIN_MK_PASSWORD',
];
function readRepoText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}
test('Pilot gate has no serial Sonar poll', () => {
  const pilotGateWorkflow = readWorkflow('.github/workflows/pilot-gate.yml');
  const pilotGatePreflightJob = pilotGateWorkflow.jobs['pilot-gate-preflight'];
  const preflightSteps = pilotGatePreflightJob.steps;
  const gatePolicyStep = findStep(preflightSteps, 'Evaluate PR gate policy');
  const sonarStrategyStep = findStep(preflightSteps, 'Decide Sonar gate strategy');
  const contract = JSON.stringify(pilotGatePreflightJob);
  assert.equal(pilotGatePreflightJob['runs-on'], 'ubuntu-latest');
  assert.equal(pilotGatePreflightJob.services, undefined);
  assert.equal(
    pilotGatePreflightJob.outputs.should_run,
    '${{ steps.gate_policy.outputs.should_run }}'
  );
  assert.equal(
    pilotGatePreflightJob.outputs.sonar_gate_enabled,
    '${{ steps.validate_secrets.outputs.sonar_gate_enabled }}'
  );
  assert.equal(
    pilotGatePreflightJob.outputs.needs_manual_sonar_fallback,
    '${{ steps.sonar_strategy.outputs.needs_manual_sonar_fallback }}'
  );
  assert.equal(gatePolicyStep.uses, TRUSTED_GATE_ACTION);
  assert.ok(findStep(preflightSteps, 'Validate required gate secrets'));
  assert.doesNotMatch(
    contract,
    /Await SonarCloud|await_sonar_check|SONAR_CHECK_MAX_RETRIES|SONAR_CHECK_RETRY_DELAY_SECONDS|sonar-check-run-gate\.sh/
  );
  assert.ok(sonarStrategyStep && sonarStrategyStep.if === undefined);
  const strategy = sonarStrategyStep.run.replace(/\s+/g, ' ');
  assert.match(
    strategy,
    /run_broad.*&&.*sonar_gate_enabled.*&&.*\(.*event_name.*!=.*pull_request.*\|\|.*SONAR_HOST_URL.*!=.*sonarcloud\.io.*\)/
  );
  assert.match(
    strategy,
    /needs_manual_sonar_fallback=false.*needs_manual_sonar_fallback=true.*GITHUB_OUTPUT/
  );
  assert.equal(
    preflightSteps.some(step => step?.uses === './.github/actions/setup'),
    false
  );
});
test('Required pilot gate wrapper fails or passes based on preflight and runner results without starting services itself', () => {
  const pilotGateWorkflow = readWorkflow('.github/workflows/pilot-gate.yml');
  const pilotGateJob = pilotGateWorkflow.jobs['pilot-gate'];
  const steps = pilotGateJob.steps;
  assert.equal(
    Object.keys(pilotGateWorkflow.jobs).join(),
    'pilot-gate-preflight,pilot-gate-runner,pilot-gate'
  );
  assert.deepEqual(normalizeNeeds(pilotGateJob.needs), [
    'pilot-gate-preflight',
    'pilot-gate-runner',
  ]);
  assert.equal(pilotGateJob.name, 'pilot-gate');
  assert.equal(pilotGateJob.if, 'always()');
  assert.equal(pilotGateJob['runs-on'], 'ubuntu-latest');
  assert.equal(pilotGateJob.services, undefined);
  assert.ok(findStep(steps, 'Enforce pilot gate preflight/result contract'));
});
test('Optional multi-agent PR hardening is no longer part of the default pull_request workflow path', () => {
  const pilotGateWorkflow = readWorkflow('.github/workflows/pilot-gate.yml');
  const multiAgentWorkflow = readWorkflow('.github/workflows/multi-agent-pr-hardening.yml');
  assert.equal(pilotGateWorkflow.jobs['multi-agent-policy'], undefined);
  assert.equal(pilotGateWorkflow.jobs['multi-agent-pr-hardening'], undefined);
  assert.ok(multiAgentWorkflow.jobs['multi-agent-pr-hardening']);
  assert.ok(multiAgentWorkflow.on.workflow_dispatch);
});
test('Composite CI setup action uses compatible actions and a bounded ripgrep bootstrap', () => {
  const setupSource = readRepoText('.github/actions/setup/action.yml');
  assert.doesNotMatch(setupSource, /\bapt(?:-get)?\b/u);
  assert.match(
    setupSource,
    /actions\/setup-node@v5[\s\S]*RIPGREP_VERSION='15\.2\.0'[\s\S]*RIPGREP_TARGET='x86_64-unknown-linux-musl'[\s\S]*RIPGREP_SHA256='33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c'[\s\S]*timeout --signal=TERM --kill-after=5s 180s[\s\S]*--proto '=https'[\s\S]*--proto-redir '=https'[\s\S]*--connect-timeout 10[\s\S]*--max-time 120[\s\S]*--retry 2[\s\S]*--retry-max-time 150[\s\S]*--max-filesize 5000000[\s\S]*sha256sum --check --strict[\s\S]*>> "\$\{GITHUB_PATH:\?\}"[\s\S]*macOS\)[\s\S]*brew install ripgrep[\s\S]*actions\/cache@v5/u
  );
});
test('V3 onboarding and env docs describe Paddle-only runtime and Vercel deployment config', () => {
  const readme = readRepoText('README.md');
  const envExample = readRepoText('.env.example');
  assert.match(readme, /V3 pilot billing uses Paddle only/);
  assert.match(envExample, /CLAIM_UPLOAD_INTENT_SECRET/);
  assert.match(envExample, /SUPABASE_PRODUCTION_PROJECT_REF/);
  assert.match(envExample, /VERCEL_ORG_ID/);
  assert.match(envExample, /VERCEL_PROJECT_ID/);
  assert.match(envExample, /VERCEL_TOKEN/);
  assert.doesNotMatch(envExample, /INTERDOMESTIK_STAGING_DEPLOY_WEBHOOK_URL/);
  assert.doesNotMatch(envExample, /INTERDOMESTIK_PRODUCTION_DEPLOY_WEBHOOK_URL/);
  assert.doesNotMatch(
    envExample,
    /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/
  );
});
test('Nightly E2E runs on an available hosted runner while preserving full strict coverage', () => {
  const workflow = readWorkflow('.github/workflows/e2e-nightly.yml');
  const job = workflow.jobs.e2e;
  assert.equal(job['runs-on'], 'ubuntu-latest');
  assert.deepEqual(workflow.on.schedule, [{ cron: '10 2 * * *' }]);
  assert.equal(job.strategy['max-parallel'], 2);
  assert.deepEqual(job.strategy.matrix, nightlyMatrix);
  const databaseUrl =
    "${{ secrets.E2E_DATABASE_URL_RLS || secrets.E2E_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test' }}";
  for (const field of ['DATABASE_URL_RLS', 'E2E_DATABASE_URL_RLS']) {
    assert.equal(job.env[field], databaseUrl);
  }
  const state = findStep(job.steps, 'Generate Playwright Gate Auth State (KS+MK)');
  assert.ok(state);
  assert.equal(state.run, 'pnpm e2e:state:setup');
  for (const name of ['E2E Gate (KS+MK)', 'E2E Phase 5 Deterministic Batch', 'E2E Smoke']) {
    assert.ok(findStep(job.steps, name));
  }
  const lifecycle = findStep(job.steps, 'E2E Subscription Lifecycle (KS+MK)');
  assert.match(lifecycle.run, /e2e\/golden\/subscription-entry\.spec\.ts/);
});
// prettier-ignore
test('CD builds distinct staging and production artifacts with explicit Supabase environment separation', () => {
  const cdWorkflowSource = fs.readFileSync(path.join(rootDir, '.github/workflows/cd.yml'), 'utf8');
  const cdWorkflow = readWorkflow('.github/workflows/cd.yml');
  const buildStagingJob = cdWorkflow.jobs['build-staging'];
  const buildProductionJob = cdWorkflow.jobs['build-production'];
  const deployStagingJob = cdWorkflow.jobs['deploy-staging'];
  const e2eStagingJob = cdWorkflow.jobs['e2e-staging'];
  const productionEvidenceJob = cdWorkflow.jobs['production-evidence'];
  const deployProductionJob = cdWorkflow.jobs['deploy-production'];
  const verifyProductionJob = cdWorkflow.jobs['verify-production'];
  assert.equal(cdWorkflow.env.VERCEL_ORG_ID, undefined);
  assert.equal(cdWorkflow.env.VERCEL_PROJECT_ID, undefined);
  assert.equal(cdWorkflow.jobs['build-push'], undefined);
  assert.doesNotMatch(cdWorkflowSource, /Actual deployment command here/);
  assert.doesNotMatch(cdWorkflowSource, /pnpm test:e2e:smoke/);
  assert.doesNotMatch(cdWorkflowSource, /Example: ssh/);
  const assertBuildJob = (job, envName, appUrl) => {
    assert.ok(job);
    assert.equal(job.environment.name, envName);
    assert.equal(job.outputs.image_tag, '${{ steps.meta.outputs.version }}');
    assert.equal(job.outputs.image_digest, '${{ steps.build.outputs.digest }}');
    const buildStep = findStep(job.steps, 'Build, attest, and verify Docker image');
    assert.ok(buildStep);
    assert.equal(buildStep.id, 'build');
    assert.equal(buildStep.uses, './.github/actions/build-attested-image');
    assert.equal(buildStep.with['deploy-env'], envName);
    assert.equal(buildStep.with['app-url'], appUrl);
  };
  assertBuildJob(buildStagingJob, 'staging', 'https://staging.interdomestik.com');
  assertBuildJob(buildProductionJob, 'production', 'https://www.interdomestik.com');
  assert.deepEqual(normalizeNeeds(buildProductionJob.needs), ['scope', 'production-evidence']);
  assert.deepEqual(normalizeNeeds(deployStagingJob.needs), ['scope', 'build-staging']);
  assert.equal(deployStagingJob['timeout-minutes'], 25);
  assert.deepEqual(deployStagingJob.outputs, {
    alias_moved: '${{ steps.vercel.outputs.alias_moved }}',
    base_url: '${{ steps.vercel.outputs.base_url }}',
    hostname: '${{ steps.vercel.outputs.hostname }}',
    gate_base_url: '${{ steps.vercel.outputs.gate_base_url }}',
    gate_hostname: '${{ steps.vercel.outputs.gate_hostname }}',
  });
  assert.equal(deployStagingJob.env.EXPECTED_COMMIT_SHA, '${{ github.sha }}');
  const vercelStagingDeployStep = findStep(deployStagingJob.steps, 'Deploy Staging to Vercel');
  assert.ok(vercelStagingDeployStep);
  assert.equal(vercelStagingDeployStep.uses, './.github/actions/trigger-digest-verified-deploy');
  assert.equal(vercelStagingDeployStep.env.VERCEL_AUTOMATION_BYPASS_SECRET, undefined);
  assert.match(vercelStagingDeployStep.with['vercel-automation-bypass-secret'], /secrets\.VERCEL/u);
  const stagingHealthIndex = findStepIndex(deployStagingJob.steps, 'Wait for Staging Health');
  const stagingProvenanceIndex = findStepIndex(deployStagingJob.steps, 'Verify Staging Build Provenance');
  const stagingAliasProvenanceIndex = findStepIndex(deployStagingJob.steps, 'Verify Staging Canonical Alias Provenance');
  assert.ok(stagingHealthIndex > findStepIndex(deployStagingJob.steps, 'Deploy Staging to Vercel'));
  assert.ok(stagingProvenanceIndex > stagingHealthIndex);
  assert.ok(stagingAliasProvenanceIndex > stagingProvenanceIndex);
  const stagingHealthStep = deployStagingJob.steps[stagingHealthIndex];
  assert.equal(stagingHealthStep.env.BASE_URL, '${{ steps.vercel.outputs.base_url }}');
  assert.match(stagingHealthStep.env.VERCEL_AUTOMATION_BYPASS_SECRET, /secrets\.VERCEL/u);
  assert.match(stagingHealthStep.run, /wait-for-vercel-health\.mjs/u);
  const stagingProvenanceStep = deployStagingJob.steps[stagingProvenanceIndex];
  assert.equal(stagingProvenanceStep.env.BASE_URL, '${{ steps.vercel.outputs.base_url }}');
  assert.match(stagingProvenanceStep.env.VERCEL_AUTOMATION_BYPASS_SECRET, /secrets\.VERCEL/u);
  assert.match(stagingProvenanceStep.run, /fetch-vercel-health\.mjs[\s\S]*EXPECTED_COMMIT_SHA/u);
  const stagingAliasProvenanceStep = deployStagingJob.steps[stagingAliasProvenanceIndex];
  assert.equal(stagingAliasProvenanceStep.env.BASE_URL, '${{ steps.vercel.outputs.gate_base_url }}');
  assert.match(stagingAliasProvenanceStep.env.VERCEL_AUTOMATION_BYPASS_SECRET, /secrets\.VERCEL/u);
  assert.match(stagingAliasProvenanceStep.run, /wait-for-vercel-health\.mjs[\s\S]*EXPECTED_COMMIT_SHA/u);
  assert.deepEqual(normalizeNeeds(e2eStagingJob.needs), ['scope', 'deploy-staging']);
  assert.deepEqual(e2eStagingJob.environment, { name: 'staging', deployment: false });
  assert.equal(e2eStagingJob.env.BASE_URL, '${{ needs.deploy-staging.outputs.gate_base_url }}');
  assert.equal(e2eStagingJob.env.AUTH_BASE_URL, 'https://staging.interdomestik.com');
  assert.equal(
    e2eStagingJob.env.RELEASE_GATE_EXTRA_HOSTNAME,
    '${{ needs.deploy-staging.outputs.hostname }}'
  );
  assert.equal(e2eStagingJob.env.RELEASE_GATE_EXPECTED_SHA, '${{ github.sha }}');
  assert.equal(e2eStagingJob.env.VERCEL_AUTOMATION_BYPASS_SECRET, undefined);
  for (const envName of RELEASE_GATE_ENV_VARS) {
    assert.match(e2eStagingJob.env[envName], new RegExp(String.raw`secrets\.${envName}`));
  }
  const stagingGateStep = findStep(e2eStagingJob.steps, 'Run Staging Release Gate');
  assert.ok(stagingGateStep);
  assert.deepEqual(normalizeNeeds(productionEvidenceJob.needs), ['scope', 'e2e-staging']);
  assert.deepEqual(productionEvidenceJob.environment, { name: 'production', deployment: false });
  const evidenceStep = findStep(productionEvidenceJob.steps, 'Check Production Human Evidence');
  assert.match(evidenceStep?.run, /pnpm release:evidence:check/);
  const productionLegTriggerGuard =
    "needs.scope.result == 'success' && needs.scope.outputs.deploy == 'true' && (startsWith(github.ref, 'refs/tags/v') || github.event_name == 'workflow_dispatch')";
  for (const productionLegJob of [
    productionEvidenceJob,
    buildProductionJob,
    deployProductionJob,
    verifyProductionJob,
  ]) {
    assert.equal(productionLegJob.if, productionLegTriggerGuard);
  }
  assert.deepEqual(normalizeNeeds(deployProductionJob.needs), ['scope', 'build-production']);
  assert.equal(deployProductionJob['timeout-minutes'], 25);
  const vercelProductionDeployStep = findStep(
    deployProductionJob.steps,
    'Deploy Production to Vercel'
  );
  assert.ok(vercelProductionDeployStep);
  assert.equal(vercelProductionDeployStep.id, 'vercel');
  assert.equal(vercelProductionDeployStep.uses, './.github/actions/trigger-digest-verified-deploy');
  assert.equal(vercelProductionDeployStep.env.ENABLE_VERCEL_DEPLOYMENTS, '1');
  assert.match(vercelProductionDeployStep.env.VERCEL_TOKEN, /secrets\.VERCEL_TOKEN/);
  assert.equal(vercelProductionDeployStep.env.VERCEL_AUTOMATION_BYPASS_SECRET, undefined);
  assert.equal(vercelProductionDeployStep.with.environment, 'production');
  assert.equal(vercelProductionDeployStep.with.production, 'true');
  assert.match(
    vercelProductionDeployStep.with['vercel-automation-bypass-secret'],
    /secrets\.VERCEL_AUTOMATION/u
  );
  assert.deepEqual(normalizeNeeds(verifyProductionJob.needs), ['scope', 'deploy-production']);
  assert.deepEqual(verifyProductionJob.environment, { name: 'production', deployment: false });
  assert.equal(verifyProductionJob.env.EXPECTED_COMMIT_SHA, '${{ github.sha }}');
  assert.equal(verifyProductionJob.env.RELEASE_GATE_EXPECTED_SHA, '${{ github.sha }}');
  for (const envName of RELEASE_GATE_ENV_VARS) {
    assert.match(verifyProductionJob.env[envName], new RegExp(String.raw`secrets\.${envName}`));
  }
  const productionSetupStep = verifyProductionJob.steps.find(
    step => step?.uses === './.github/actions/setup'
  );
  assert.equal(productionSetupStep.with['install-playwright'], 'true');
  const productionHealthIndex = findStepIndex(verifyProductionJob.steps, 'Health Check');
  const productionProvenanceIndex = findStepIndex(verifyProductionJob.steps, 'Verify Production Build Provenance');
  const productionGateIndex = findStepIndex(verifyProductionJob.steps, 'Run Production Release Gate');
  assert.ok(productionHealthIndex >= 0);
  assert.ok(productionProvenanceIndex > productionHealthIndex);
  assert.ok(productionGateIndex > productionProvenanceIndex);
  const productionHealthStep = verifyProductionJob.steps[productionHealthIndex];
  assert.match(productionHealthStep.run, /wait-for-vercel-health\.mjs/u);
  const productionProvenanceStep = verifyProductionJob.steps[productionProvenanceIndex];
  assert.match(productionProvenanceStep.run, /fetch-vercel-health\.mjs/u);
  assert.match(productionProvenanceStep.run, /EXPECTED_COMMIT_SHA/);
  const productionGateStep = verifyProductionJob.steps[productionGateIndex];
  assert.match(productionGateStep.run, /release:gate:raw/);
  assert.match(productionGateStep.run, /--envName production/);
  assert.match(productionGateStep.run, /--suite all/);
  const productionArtifactsStep = findStep(
    verifyProductionJob.steps,
    'Upload production verification artifacts'
  );
  assert.equal(productionArtifactsStep['continue-on-error'], undefined);
  assert.match(productionArtifactsStep.with.path, /release-gates/);
  assert.equal(productionArtifactsStep.with['if-no-files-found'], 'error');
});
