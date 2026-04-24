import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

function readWorkflow(relativePath) {
  const content = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
  return yaml.load(content);
}

function findStep(steps, name) {
  return steps.find(step => step?.name === name);
}

function findStepIndex(steps, name) {
  return steps.findIndex(step => step?.name === name);
}

function normalizeNeeds(needs) {
  if (Array.isArray(needs)) {
    return needs;
  }

  if (typeof needs === 'string') {
    return [needs];
  }

  return [];
}

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

test('CI PR path keeps only RLS coverage while PR E2E owns the full browser gate lane', () => {
  const ciWorkflow = readWorkflow('.github/workflows/ci.yml');
  const prE2eWorkflow = readWorkflow('.github/workflows/e2e-pr.yml');

  const validationSurfaceJob = ciWorkflow.jobs['validation-surface'];
  assert.ok(validationSurfaceJob);

  const ciE2eGateJob = ciWorkflow.jobs['e2e-gate'];
  const ciSteps = ciE2eGateJob.steps;
  const ciE2eNeeds = normalizeNeeds(ciE2eGateJob.needs);

  assert.ok(ciE2eNeeds.includes('validation-surface'));
  assert.equal(ciE2eGateJob.if, "needs.validation-surface.outputs.should_run == 'true'");

  const setupStep = ciSteps.find(step => step?.uses === './.github/actions/setup');
  assert.equal(setupStep.with['install-playwright'], "${{ github.event_name != 'pull_request' }}");

  const strictGuardStep = findStep(ciSteps, 'Enforce E2E Best Practices');
  assert.equal(strictGuardStep.if, "github.event_name != 'pull_request'");

  const prepareDbStep = findStep(ciSteps, 'Prepare E2E Database');
  assert.equal(prepareDbStep.if, undefined);

  const rlsStep = findStep(ciSteps, 'RLS Integration Test');
  assert.equal(rlsStep.if, undefined);

  const e2eGateSuiteStep = findStep(ciSteps, 'E2E Gate Suite');
  assert.equal(e2eGateSuiteStep.if, "github.event_name != 'pull_request'");

  const staticJob = ciWorkflow.jobs.static;
  assert.ok(normalizeNeeds(staticJob.needs).includes('validation-surface'));
  assert.equal(staticJob.if, "needs.validation-surface.outputs.should_run == 'true'");

  const unitJob = ciWorkflow.jobs.unit;
  assert.ok(normalizeNeeds(unitJob.needs).includes('validation-surface'));
  assert.equal(unitJob.if, "needs.validation-surface.outputs.should_run == 'true'");

  const prE2eJob = prE2eWorkflow.jobs.e2e;
  const prE2eSetupStep = prE2eJob.steps.find(step => step?.uses === './.github/actions/setup');
  assert.equal(prE2eSetupStep.with['install-playwright'], true);

  const prStrictGuardStep = findStep(prE2eJob.steps, 'Strict Rule Guards (golden/gate)');
  assert.ok(prStrictGuardStep);

  const fullGateStep = findStep(prE2eJob.steps, 'Run Full E2E Gate');
  assert.ok(fullGateStep);
  assert.equal(fullGateStep.run, 'pnpm e2e:gate');
  assert.deepEqual(fullGateStep.env, {
    E2E_DATABASE_URL: '${{ env.DATABASE_URL }}',
    E2E_DATABASE_URL_RLS: '${{ env.DATABASE_URL }}',
  });

  assert.equal(findStep(prE2eJob.steps, 'Generate Playwright Gate Auth State (KS+MK)'), undefined);
  assert.equal(findStep(prE2eJob.steps, 'E2E Subscription Lifecycle (KS+MK)'), undefined);
  assert.equal(findStep(prE2eJob.steps, 'E2E Smoke Suite (KS+MK)'), undefined);
});

test('CI no longer materializes optional AI-eval and multi-agent dry-run lanes on the default PR path', () => {
  const ciWorkflow = readWorkflow('.github/workflows/ci.yml');
  const validationSurfaceJob = ciWorkflow.jobs['validation-surface'];

  assert.equal(validationSurfaceJob.outputs.ai_eval_should_run, undefined);
  assert.equal(validationSurfaceJob.outputs.ai_eval_reason, undefined);
  assert.equal(validationSurfaceJob.outputs.ai_eval_matched_paths, undefined);
  assert.equal(findStep(validationSurfaceJob.steps, 'Evaluate AI eval surface'), undefined);
  assert.equal(ciWorkflow.jobs['ai-eval'], undefined);
  assert.equal(ciWorkflow.jobs['multi-agent-dry-run'], undefined);
});

test('CI unit lane runs the blocking repository coverage gate', () => {
  const ciWorkflow = readWorkflow('.github/workflows/ci.yml');
  const unitJob = ciWorkflow.jobs.unit;

  assert.ok(unitJob);
  assert.ok(normalizeNeeds(unitJob.needs).includes('validation-surface'));
  assert.equal(unitJob.if, "needs.validation-surface.outputs.should_run == 'true'");

  const coverageStep = findStep(unitJob.steps, 'Coverage Gate');
  assert.ok(coverageStep);
  assert.equal(coverageStep.run, 'pnpm coverage:gate');
});

test('Secret Scan is the sole blocking gitleaks surface for PR and mainline while Security stays pnpm-audit-only', () => {
  const secretScanWorkflow = readWorkflow('.github/workflows/secret-scan.yml');
  const securityWorkflow = readWorkflow('.github/workflows/security.yml');

  assert.deepEqual(secretScanWorkflow.on.push.branches, ['main', 'master', 'rc/**', 'release/**']);
  assert.deepEqual(secretScanWorkflow.on.pull_request.branches, ['**']);
  assert.deepEqual(secretScanWorkflow.on.schedule, [{ cron: '0 6 * * 1' }]);

  const gitleaksJob = secretScanWorkflow.jobs.gitleaks;
  assert.ok(gitleaksJob);
  assert.equal(gitleaksJob['runs-on'], 'ubuntu-latest');
  assert.equal(gitleaksJob.if, undefined);
  assert.ok(findStep(gitleaksJob.steps, 'Install gitleaks CLI'));
  const runStep = findStep(gitleaksJob.steps, 'Run gitleaks (blocking)');
  assert.ok(runStep);
  assert.match(runStep.run, /log_opts="--all"/);
  assert.match(
    runStep.run,
    /if \[\[ "\$\{GITHUB_EVENT_NAME\}" == "pull_request" && -n "\$\{GITHUB_BASE_SHA:-\}" && -n "\$\{GITHUB_HEAD_SHA:-\}" \]\]; then/
  );
  assert.match(runStep.run, /log_opts="\$\{GITHUB_BASE_SHA\}\.\.\$\{GITHUB_HEAD_SHA\}"/);
  assert.match(
    runStep.run,
    /elif \[\[ "\$\{GITHUB_EVENT_NAME\}" == "push" && -n "\$\{GITHUB_BEFORE_SHA:-\}" && "\$\{GITHUB_BEFORE_SHA\}" != "0000000000000000000000000000000000000000" \]\]; then/
  );
  assert.match(runStep.run, /log_opts="\$\{GITHUB_BEFORE_SHA\}\.\.\$\{GITHUB_SHA\}"/);
  assert.equal(runStep.run.includes('log_opts="-n 1"'), false);
  assert.ok(findStep(gitleaksJob.steps, 'Upload gitleaks report artifact'));

  const securityAuditJob = securityWorkflow.jobs['pnpm-audit'];
  assert.ok(securityAuditJob);
  assert.equal(findStep(securityAuditJob.steps, 'Install gitleaks CLI'), undefined);
  assert.equal(findStep(securityAuditJob.steps, 'Run gitleaks (blocking)'), undefined);
  assert.equal(findStep(securityAuditJob.steps, 'Upload gitleaks report artifact'), undefined);
});

test('Heavy PR workflows always materialize on PRs and delegate docs-only skipping to validation surface checks', () => {
  const prE2eWorkflow = readWorkflow('.github/workflows/e2e-pr.yml');
  const pilotGateWorkflow = readWorkflow('.github/workflows/pilot-gate.yml');
  const prE2eJob = prE2eWorkflow.jobs.e2e;
  const pilotGatePreflightJob = pilotGateWorkflow.jobs['pilot-gate-preflight'];

  assert.equal(prE2eWorkflow.on.pull_request['paths-ignore'], undefined);
  assert.equal(pilotGateWorkflow.on.pull_request['paths-ignore'], undefined);
  assert.ok(findStep(prE2eJob.steps, 'Evaluate validation surface'));
  assert.ok(findStep(prE2eJob.steps, 'Skip strict PR E2E for non-product-only changes'));
  assert.ok(findStep(pilotGatePreflightJob.steps, 'Evaluate validation surface'));
  assert.ok(findStep(pilotGatePreflightJob.steps, 'Skip pilot gate for non-product-only changes'));
});

test('Pilot gate moves validation-surface, secrets, and PR Sonar checks into a lightweight preflight job', () => {
  const pilotGateWorkflow = readWorkflow('.github/workflows/pilot-gate.yml');
  const pilotGatePreflightJob = pilotGateWorkflow.jobs['pilot-gate-preflight'];
  const awaitSonarStep = findStep(
    pilotGatePreflightJob.steps,
    'Await SonarCloud Code Analysis check'
  );
  const sonarStrategyStep = findStep(pilotGatePreflightJob.steps, 'Decide Sonar gate strategy');

  assert.ok(pilotGatePreflightJob);
  const preflightSteps = pilotGatePreflightJob.steps;
  assert.equal(pilotGatePreflightJob['runs-on'], 'ubuntu-latest');
  assert.equal(pilotGatePreflightJob.services, undefined);
  assert.equal(
    pilotGatePreflightJob.outputs.should_run,
    '${{ steps.validation_surface.outputs.should_run }}'
  );
  assert.equal(
    pilotGatePreflightJob.outputs.sonar_gate_enabled,
    '${{ steps.validate_secrets.outputs.sonar_gate_enabled }}'
  );
  assert.equal(
    pilotGatePreflightJob.outputs.needs_manual_sonar_fallback,
    '${{ steps.sonar_strategy.outputs.needs_manual_sonar_fallback }}'
  );
  assert.ok(findStep(preflightSteps, 'Evaluate validation surface'));
  assert.ok(findStep(preflightSteps, 'Validate required gate secrets'));
  assert.ok(awaitSonarStep);
  assert.equal(awaitSonarStep['continue-on-error'], true);
  assert.equal(awaitSonarStep.env.SONAR_CHECK_MAX_RETRIES, '6');
  assert.equal(awaitSonarStep.env.SONAR_CHECK_RETRY_DELAY_SECONDS, '10');
  assert.ok(sonarStrategyStep);
  assert.equal(
    preflightSteps.some(step => step?.uses === './.github/actions/setup'),
    false
  );
});

test('Pilot gate heavy runner depends on preflight before Postgres, setup, build, and release-gate work', () => {
  const pilotGateWorkflow = readWorkflow('.github/workflows/pilot-gate.yml');
  const pilotGateJob = pilotGateWorkflow.jobs['pilot-gate-runner'];

  assert.ok(pilotGateJob);
  const steps = pilotGateJob.steps;
  const needs = normalizeNeeds(pilotGateJob.needs);
  const setupIndex = steps.findIndex(step => step?.uses === './.github/actions/setup');
  const manualSonarIndex = findStepIndex(steps, 'Run Sonar quality gate (manual fallback)');
  const prepareDbIndex = findStepIndex(steps, 'Prepare CI database');
  const buildIndex = findStepIndex(steps, 'Build web standalone artifact');

  assert.ok(needs.includes('pilot-gate-preflight'));
  assert.equal(pilotGateJob.if, "needs.pilot-gate-preflight.outputs.should_run == 'true'");
  assert.equal(pilotGateJob.env.DATABASE_URL_RLS, pilotGateJob.env.DATABASE_URL);
  assert.ok(setupIndex >= 0);
  assert.ok(manualSonarIndex >= 0);
  assert.ok(prepareDbIndex >= 0);
  assert.ok(buildIndex >= 0);
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

test('Sonar main gate skips manual fallback for non-push SonarCloud runs while keeping push blocking intact', () => {
  const workflow = readWorkflow('.github/workflows/sonar-main-gate.yml');
  const job = workflow.jobs['sonar-gate'];

  assert.ok(job);
  const steps = job.steps;
  const validateStep = findStep(steps, 'Validate Sonar configuration');
  const strategyStep = findStep(steps, 'Decide Sonar main gate strategy');
  const awaitStep = findStep(steps, 'Await SonarCloud Code Analysis check (blocking on push)');
  const fallbackStep = findStep(steps, 'Run Sonar quality gate (manual fallback)');

  assert.ok(validateStep);
  assert.ok(strategyStep);
  assert.equal(strategyStep.if, "env.SONAR_GATE_ENABLED == 'true'");
  assert.match(strategyStep.run, /RUN_MANUAL_FALLBACK/);
  assert.match(strategyStep.run, /sonarcloud\.io/);
  assert.match(strategyStep.run, /SonarCloud Automatic Analysis owns mainline analysis/);

  assert.ok(awaitStep);
  assert.equal(awaitStep.if, "github.event_name == 'push' && env.SONAR_GATE_ENABLED == 'true'");

  assert.ok(fallbackStep);
  assert.equal(
    fallbackStep.if,
    "github.event_name != 'push' && env.SONAR_GATE_ENABLED == 'true' && env.RUN_MANUAL_FALLBACK == 'true'"
  );
});

test('Required pilot gate wrapper fails or passes based on preflight and runner results without starting services itself', () => {
  const pilotGateWorkflow = readWorkflow('.github/workflows/pilot-gate.yml');
  const pilotGateJob = pilotGateWorkflow.jobs['pilot-gate'];

  assert.ok(pilotGateJob);
  const steps = pilotGateJob.steps;
  const needs = normalizeNeeds(pilotGateJob.needs);
  assert.ok(needs.includes('pilot-gate-preflight'));
  assert.ok(needs.includes('pilot-gate-runner'));
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

test('CI audit job runs the scripts/ci contract suite', () => {
  const ciWorkflow = readWorkflow('.github/workflows/ci.yml');
  const auditJob = ciWorkflow.jobs.audit;
  const auditRunStep = findStep(auditJob.steps, 'Run Audits');

  assert.ok(auditRunStep);
  assert.match(auditRunStep.run, /\bpnpm test:ci:contracts\b/);
  assert.match(auditRunStep.run, /\bpnpm check:e2e-contracts\b/);
  assert.match(auditRunStep.run, /\bpnpm lint:production-warnings\b/);
});

test('Composite CI setup action uses Node 24-compatible hosted actions', () => {
  const setupAction = readWorkflow('.github/actions/setup/action.yml');
  const steps = setupAction.runs.steps;

  assert.equal(findStep(steps, 'Setup Node').uses, 'actions/setup-node@v5');
  assert.equal(findStep(steps, 'Playwright Browser Cache').uses, 'actions/cache@v5');
});

test('V3 onboarding and env docs describe Paddle-only runtime and deploy proof secrets', () => {
  const readRepoText = relativePath => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
  const readme = readRepoText('README.md');
  const architecture = readRepoText('docs/ARCHITECTURE.md');
  const envExample = readRepoText('.env.example');

  assert.match(readme, /V3 pilot billing uses Paddle only/);
  assert.match(architecture, /environment-scoped deploy webhook secrets/);
  assert.match(envExample, /CLAIM_UPLOAD_INTENT_SECRET/);
  assert.match(envExample, /SUPABASE_PRODUCTION_PROJECT_REF/);
  assert.match(envExample, /INTERDOMESTIK_STAGING_DEPLOY_WEBHOOK_URL/);
  assert.match(envExample, /INTERDOMESTIK_STAGING_DEPLOY_TOKEN/);
  assert.match(envExample, /INTERDOMESTIK_PRODUCTION_DEPLOY_WEBHOOK_URL/);
  assert.match(envExample, /INTERDOMESTIK_PRODUCTION_DEPLOY_TOKEN/);
  assert.doesNotMatch(
    envExample,
    /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/
  );
});

test('CD builds distinct staging and production artifacts with explicit Supabase environment separation', () => {
  const cdWorkflowSource = fs.readFileSync(path.join(rootDir, '.github/workflows/cd.yml'), 'utf8');
  const cdWorkflow = readWorkflow('.github/workflows/cd.yml');
  const buildStagingJob = cdWorkflow.jobs['build-staging'];
  const buildProductionJob = cdWorkflow.jobs['build-production'];
  const deployStagingJob = cdWorkflow.jobs['deploy-staging'];
  const e2eStagingJob = cdWorkflow.jobs['e2e-staging'];
  const deployProductionJob = cdWorkflow.jobs['deploy-production'];
  const verifyProductionJob = cdWorkflow.jobs['verify-production'];

  assert.equal(cdWorkflow.jobs['build-push'], undefined);
  assert.doesNotMatch(cdWorkflowSource, /Actual deployment command here/);
  assert.doesNotMatch(cdWorkflowSource, /pnpm test:e2e:smoke/);
  assert.doesNotMatch(cdWorkflowSource, /Example: ssh/);

  assert.ok(buildStagingJob);
  assert.equal(buildStagingJob.environment.name, 'staging');
  assert.equal(buildStagingJob.outputs.image_tag, '${{ steps.meta.outputs.version }}');
  const buildStagingStep = findStep(buildStagingJob.steps, 'Build and push Docker image');
  assert.ok(buildStagingStep);
  assert.match(buildStagingStep.with['build-args'], /COMMIT_SHA=\$\{\{\s*github\.sha\s*\}\}/);
  assert.match(buildStagingStep.with['build-args'], /INTERDOMESTIK_DEPLOY_ENV=staging/);
  assert.match(
    buildStagingStep.with['build-args'],
    /NEXT_PUBLIC_APP_URL=https:\/\/staging\.interdomestik\.com/
  );
  assert.match(
    buildStagingStep.with['build-args'],
    /NEXT_PUBLIC_SUPABASE_URL=\$\{\{\s*(vars|secrets)\.NEXT_PUBLIC_SUPABASE_URL/
  );
  assert.match(
    buildStagingStep.with['build-args'],
    /NEXT_PUBLIC_SUPABASE_ANON_KEY=\$\{\{\s*(vars|secrets)\.NEXT_PUBLIC_SUPABASE_ANON_KEY/
  );
  assert.match(
    buildStagingStep.with['build-args'],
    /SUPABASE_PRODUCTION_PROJECT_REF=\$\{\{\s*(vars|secrets)\.SUPABASE_PRODUCTION_PROJECT_REF/
  );

  assert.ok(buildProductionJob);
  assert.deepEqual(normalizeNeeds(buildProductionJob.needs), ['e2e-staging']);
  assert.equal(buildProductionJob.environment.name, 'production');
  assert.equal(buildProductionJob.outputs.image_tag, '${{ steps.meta.outputs.version }}');
  const buildProductionStep = findStep(buildProductionJob.steps, 'Build and push Docker image');
  assert.ok(buildProductionStep);
  assert.match(buildProductionStep.with['build-args'], /COMMIT_SHA=\$\{\{\s*github\.sha\s*\}\}/);
  assert.match(buildProductionStep.with['build-args'], /INTERDOMESTIK_DEPLOY_ENV=production/);
  assert.match(
    buildProductionStep.with['build-args'],
    /NEXT_PUBLIC_APP_URL=https:\/\/app\.interdomestik\.com/
  );
  assert.match(
    buildProductionStep.with['build-args'],
    /NEXT_PUBLIC_SUPABASE_URL=\$\{\{\s*(vars|secrets)\.NEXT_PUBLIC_SUPABASE_URL/
  );
  assert.match(
    buildProductionStep.with['build-args'],
    /NEXT_PUBLIC_SUPABASE_ANON_KEY=\$\{\{\s*(vars|secrets)\.NEXT_PUBLIC_SUPABASE_ANON_KEY/
  );
  assert.match(
    buildProductionStep.with['build-args'],
    /SUPABASE_PRODUCTION_PROJECT_REF=\$\{\{\s*(vars|secrets)\.SUPABASE_PRODUCTION_PROJECT_REF/
  );

  assert.deepEqual(normalizeNeeds(deployStagingJob.needs), ['build-staging']);
  assert.equal(
    deployStagingJob.env.DEPLOY_WEBHOOK_URL,
    '${{ secrets.INTERDOMESTIK_STAGING_DEPLOY_WEBHOOK_URL }}'
  );
  assert.equal(
    deployStagingJob.env.DEPLOY_WEBHOOK_TOKEN,
    '${{ secrets.INTERDOMESTIK_STAGING_DEPLOY_TOKEN }}'
  );
  assert.equal(deployStagingJob.env.EXPECTED_COMMIT_SHA, '${{ github.sha }}');
  const triggerStagingDeployStep = findStep(deployStagingJob.steps, 'Trigger Staging Deploy');
  assert.ok(triggerStagingDeployStep);
  assert.match(triggerStagingDeployStep.run, /INTERDOMESTIK_STAGING_DEPLOY_WEBHOOK_URL/);
  assert.match(triggerStagingDeployStep.run, /INTERDOMESTIK_STAGING_DEPLOY_TOKEN/);
  assert.match(triggerStagingDeployStep.run, /authorization: Bearer/);
  assert.match(triggerStagingDeployStep.run, /curl --silent --show-error/);
  assert.match(triggerStagingDeployStep.run, /http_status/);
  assert.match(triggerStagingDeployStep.run, /needs\.build-staging\.outputs\.image_tag/);
  const stagingHealthIndex = findStepIndex(deployStagingJob.steps, 'Wait for Staging Health');
  const stagingProvenanceIndex = findStepIndex(
    deployStagingJob.steps,
    'Verify Staging Build Provenance'
  );
  assert.ok(stagingHealthIndex >= 0);
  assert.ok(stagingProvenanceIndex > stagingHealthIndex);
  const stagingProvenanceStep = deployStagingJob.steps[stagingProvenanceIndex];
  assert.match(stagingProvenanceStep.run, /build\?\.commitSha/);
  assert.match(stagingProvenanceStep.run, /EXPECTED_COMMIT_SHA/);

  assert.deepEqual(normalizeNeeds(e2eStagingJob.needs), ['deploy-staging']);
  assert.equal(e2eStagingJob.env.RELEASE_GATE_EXPECTED_SHA, '${{ github.sha }}');
  for (const envName of RELEASE_GATE_ENV_VARS) {
    assert.match(e2eStagingJob.env[envName], new RegExp(String.raw`secrets\.${envName}`));
  }
  const stagingSetupStep = e2eStagingJob.steps.find(
    step => step?.uses === './.github/actions/setup'
  );
  assert.equal(stagingSetupStep.with['install-playwright'], 'true');
  const stagingGateStep = findStep(e2eStagingJob.steps, 'Run Staging Release Gate');
  assert.ok(stagingGateStep);
  assert.match(stagingGateStep.run, /release:gate:raw/);
  assert.match(stagingGateStep.run, /--envName staging/);
  assert.match(stagingGateStep.run, /--suite p0/);
  const stagingArtifactsStep = findStep(
    e2eStagingJob.steps,
    'Upload staging verification artifacts'
  );
  assert.ok(stagingArtifactsStep);
  assert.equal(stagingArtifactsStep['continue-on-error'], undefined);
  assert.equal(stagingArtifactsStep.with['if-no-files-found'], 'error');

  assert.deepEqual(normalizeNeeds(deployProductionJob.needs), ['build-production']);
  assert.equal(
    deployProductionJob.env.DEPLOY_WEBHOOK_URL,
    '${{ secrets.INTERDOMESTIK_PRODUCTION_DEPLOY_WEBHOOK_URL }}'
  );
  assert.equal(
    deployProductionJob.env.DEPLOY_WEBHOOK_TOKEN,
    '${{ secrets.INTERDOMESTIK_PRODUCTION_DEPLOY_TOKEN }}'
  );
  const triggerProductionDeployStep = findStep(
    deployProductionJob.steps,
    'Trigger Production Deploy'
  );
  assert.ok(triggerProductionDeployStep);
  assert.match(triggerProductionDeployStep.run, /INTERDOMESTIK_PRODUCTION_DEPLOY_WEBHOOK_URL/);
  assert.match(triggerProductionDeployStep.run, /INTERDOMESTIK_PRODUCTION_DEPLOY_TOKEN/);
  assert.match(triggerProductionDeployStep.run, /authorization: Bearer/);
  assert.match(triggerProductionDeployStep.run, /curl --silent --show-error/);
  assert.match(triggerProductionDeployStep.run, /http_status/);
  assert.match(triggerProductionDeployStep.run, /needs\.build-production\.outputs\.image_tag/);

  assert.deepEqual(normalizeNeeds(verifyProductionJob.needs), ['deploy-production']);
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
  const productionProvenanceIndex = findStepIndex(
    verifyProductionJob.steps,
    'Verify Production Build Provenance'
  );
  const productionGateIndex = findStepIndex(
    verifyProductionJob.steps,
    'Run Production Release Gate'
  );
  assert.ok(productionHealthIndex >= 0);
  assert.ok(productionProvenanceIndex > productionHealthIndex);
  assert.ok(productionGateIndex > productionProvenanceIndex);
  const productionProvenanceStep = verifyProductionJob.steps[productionProvenanceIndex];
  assert.match(productionProvenanceStep.run, /build\?\.commitSha/);
  assert.match(productionProvenanceStep.run, /EXPECTED_COMMIT_SHA/);
  const productionGateStep = findStep(verifyProductionJob.steps, 'Run Production Release Gate');
  assert.ok(productionGateStep);
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
