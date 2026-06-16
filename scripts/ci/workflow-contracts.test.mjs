import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

import {
  hasE2EApiPlaceholder,
  hasReleaseGateLiteralPassword,
} from '../check-workflow-seed-credentials.mjs';

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

const WORKFLOWS_WITH_GENERATED_E2E_CREDENTIALS = [
  '.github/workflows/ci.yml',
  '.github/workflows/e2e-pr.yml',
  '.github/workflows/e2e-nightly.yml',
  '.github/workflows/release-candidate.yml',
  '.github/workflows/pilot-gate.yml',
  '.github/workflows/multi-agent-pr-hardening.yml',
];

function readRepoText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('workflow seed credential hardening rejects shared release passwords and E2E API placeholders', () => {
  const workflowPaths = fs
    .readdirSync(path.join(rootDir, '.github', 'workflows'))
    .filter(fileName => /\.ya?ml$/u.test(fileName))
    .map(fileName => `.github/workflows/${fileName}`);

  for (const workflowPath of workflowPaths) {
    const source = readRepoText(workflowPath);
    assert.equal(
      hasReleaseGateLiteralPassword(source),
      false,
      `${workflowPath} must not set release-gate account passwords to the shared seeded-user default`
    );
    assert.equal(
      hasE2EApiPlaceholder(source),
      false,
      `${workflowPath} must not use the shared E2E API placeholder secret`
    );
  }
});

test('seeded CI workflows generate masked per-run E2E credentials before seeded auth work', () => {
  for (const workflowPath of WORKFLOWS_WITH_GENERATED_E2E_CREDENTIALS) {
    const source = readRepoText(workflowPath);
    assert.match(source, /name:\s*Generate ephemeral E2E credentials/u, workflowPath);
    assert.match(source, /bash scripts\/ci\/export-e2e-credentials\.sh/u, workflowPath);
  }
  const ciWorkflow = readWorkflow('.github/workflows/ci.yml');
  const ciSteps = ciWorkflow.jobs['e2e-gate'].steps;
  assert.ok(
    findStepIndex(ciSteps, 'Generate ephemeral E2E credentials') <
      findStepIndex(ciSteps, 'Prepare E2E Database')
  );
  const prE2eWorkflow = readWorkflow('.github/workflows/e2e-pr.yml');
  const prE2eSteps = prE2eWorkflow.jobs.e2e.steps;
  assert.ok(
    findStepIndex(prE2eSteps, 'Generate ephemeral E2E credentials') <
      findStepIndex(prE2eSteps, 'Run PR E2E Gate')
  );
  const nightlyWorkflow = readWorkflow('.github/workflows/e2e-nightly.yml');
  const nightlySteps = nightlyWorkflow.jobs.e2e.steps;
  assert.ok(
    findStepIndex(nightlySteps, 'Generate ephemeral E2E credentials') <
      findStepIndex(nightlySteps, 'Seed E2E DB')
  );
  const releaseCandidateWorkflow = readWorkflow('.github/workflows/release-candidate.yml');
  const releaseCandidateSteps = releaseCandidateWorkflow.jobs['rc-gate'].steps;
  assert.ok(
    findStepIndex(releaseCandidateSteps, 'Generate ephemeral E2E credentials') <
      findStepIndex(releaseCandidateSteps, 'Prepare CI database')
  );
  const pilotGateWorkflow = readWorkflow('.github/workflows/pilot-gate.yml');
  const pilotGateSteps = pilotGateWorkflow.jobs['pilot-gate-runner'].steps;
  assert.ok(
    findStepIndex(pilotGateSteps, 'Generate ephemeral E2E credentials') <
      findStepIndex(pilotGateSteps, 'Prepare CI database')
  );
  const multiAgentWorkflow = readWorkflow('.github/workflows/multi-agent-pr-hardening.yml');
  const multiAgentSteps = multiAgentWorkflow.jobs['multi-agent-pr-hardening'].steps;
  assert.ok(
    findStepIndex(multiAgentSteps, 'Generate ephemeral E2E credentials') <
      findStepIndex(multiAgentSteps, 'Prepare CI database')
  );
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
  assert.equal(ciE2eGateJob.if, "needs.validation-surface.outputs.should_run == 'true'");

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
  assert.match(prStrictGuardStep.run, /guards/u);

  const prGateStep = findStep(prE2eJob.steps, 'Run PR E2E Gate');
  assert.equal(prGateStep.run, 'pnpm e2e:gate:pr');
  assert.deepEqual(prGateStep.env, {
    E2E_DATABASE_URL: '${{ env.DATABASE_URL }}',
    E2E_DATABASE_URL_RLS: '${{ env.DATABASE_URL }}',
  });

  assert.equal(findStep(prE2eJob.steps, 'Generate Playwright Gate Auth State (KS+MK)'), undefined);
  assert.equal(findStep(prE2eJob.steps, 'E2E Subscription Lifecycle (KS+MK)'), undefined);
  assert.equal(findStep(prE2eJob.steps, 'E2E Smoke Suite (KS+MK)'), undefined);
});

test('CI materializes AI eval as a blocking surface-gated lane', () => {
  const ciWorkflow = readWorkflow('.github/workflows/ci.yml');
  const validationSurfaceJob = ciWorkflow.jobs['validation-surface'];
  const aiEvalJob = ciWorkflow.jobs['ai-eval'];

  assert.equal(
    validationSurfaceJob.outputs.ai_eval_should_run,
    '${{ steps.ai_eval_surface.outputs.should_run }}'
  );
  assert.equal(
    validationSurfaceJob.outputs.ai_eval_reason,
    '${{ steps.ai_eval_surface.outputs.reason }}'
  );
  assert.equal(
    validationSurfaceJob.outputs.ai_eval_matched_paths,
    '${{ steps.ai_eval_surface.outputs.matched_paths }}'
  );

  const aiEvalSurfaceStep = findStep(validationSurfaceJob.steps, 'Evaluate AI eval surface');
  assert.ok(aiEvalSurfaceStep);
  assert.equal(aiEvalSurfaceStep.id, 'ai_eval_surface');
  assert.match(aiEvalSurfaceStep.run, /scripts\/ci\/ai-eval-surface\.mjs/u);

  assert.ok(aiEvalJob);
  assert.ok(normalizeNeeds(aiEvalJob.needs).includes('validation-surface'));
  assert.equal(aiEvalJob.if, "needs.validation-surface.outputs.ai_eval_should_run == 'true'");
  assert.equal(aiEvalJob['continue-on-error'], undefined);
  const runStep = findStep(aiEvalJob.steps, 'Run AI Eval Fixtures');
  assert.ok(runStep);
  assert.equal(runStep.run, 'pnpm ai:eval');
  assert.equal(ciWorkflow.jobs['multi-agent-dry-run'], undefined);
});

test('Release candidate gate includes blocking AI eval fixture proof', () => {
  const releaseCandidateWorkflow = readWorkflow('.github/workflows/release-candidate.yml');
  const releaseCandidateSteps = releaseCandidateWorkflow.jobs['rc-gate'].steps;

  const aiEvalStep = findStep(releaseCandidateSteps, 'RC check - AI eval fixtures');
  assert.ok(aiEvalStep);
  assert.equal(aiEvalStep['continue-on-error'], undefined);
  assert.match(aiEvalStep.run, /\bpnpm ai:eval\b/u);
  assert.match(aiEvalStep.run, /ai_eval\.exit/u);
  assert.ok(
    findStepIndex(releaseCandidateSteps, 'Prepare RC workspace') <
      findStepIndex(releaseCandidateSteps, 'RC check - AI eval fixtures')
  );
  assert.ok(
    findStepIndex(releaseCandidateSteps, 'RC check - AI eval fixtures') <
      findStepIndex(releaseCandidateSteps, 'Prepare CI database')
  );
  const rcAuthStateStep = findStep(releaseCandidateSteps, 'Generate Playwright auth states');
  assert.ok(rcAuthStateStep, 'release candidate auth-state setup step should exist');
  assert.equal(rcAuthStateStep.run, 'pnpm e2e:state:setup');
  assert.equal(rcAuthStateStep.env.E2E_DATABASE_URL, '${{ env.DATABASE_URL }}');
  assert.equal(rcAuthStateStep.env.E2E_DATABASE_URL_RLS, '${{ env.DATABASE_URL }}');
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

test('Nightly E2E runs on an available hosted runner while preserving full strict coverage', () => {
  const nightlyWorkflow = readWorkflow('.github/workflows/e2e-nightly.yml');
  const nightlyJob = nightlyWorkflow.jobs.e2e;

  assert.equal(nightlyJob['runs-on'], 'ubuntu-latest');
  assert.deepEqual(nightlyWorkflow.on.schedule, [{ cron: '10 2 * * *' }]);
  assert.equal(nightlyJob.strategy['max-parallel'], 2);
  assert.deepEqual(nightlyJob.strategy.matrix, {
    shardIndex: [1, 2, 3],
    shardTotal: [3],
  });
  const e2eDatabaseUrl =
    "${{ secrets.E2E_DATABASE_URL_RLS || secrets.E2E_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test' }}";
  assert.equal(nightlyJob.env.DATABASE_URL_RLS, e2eDatabaseUrl);
  assert.equal(nightlyJob.env.E2E_DATABASE_URL_RLS, e2eDatabaseUrl);
  const nightlyStateStep = findStep(
    nightlyJob.steps,
    'Generate Playwright Gate Auth State (KS+MK)'
  );
  assert.ok(nightlyStateStep);
  assert.equal(nightlyStateStep.run, 'pnpm e2e:state:setup');
  assert.ok(findStep(nightlyJob.steps, 'E2E Gate (KS+MK)'));
  assert.match(
    findStep(nightlyJob.steps, 'E2E Subscription Lifecycle (KS+MK)').run,
    /e2e\/golden\/subscription-entry\.spec\.ts/
  );
  assert.ok(findStep(nightlyJob.steps, 'E2E Phase 5 Deterministic Batch'));
  assert.ok(findStep(nightlyJob.steps, 'E2E Smoke'));
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
  assert.equal(awaitSonarStep.env.SONAR_CHECK_MAX_RETRIES, '36');
  assert.equal(awaitSonarStep.env.SONAR_CHECK_RETRY_DELAY_SECONDS, '10');
  assert.ok(sonarStrategyStep);
  assert.match(sonarStrategyStep.run, /steps\.await_sonar_check\.outcome/);
  assert.doesNotMatch(sonarStrategyStep.run, /steps\.await_sonar_check\.conclusion/);
  assert.match(sonarStrategyStep.run, /sonarcloud\.io/);
  assert.match(sonarStrategyStep.run, /manual fallback is skipped/);
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

test('CI audit job runs the scripts/ci contract suite', () => {
  const ciWorkflow = readWorkflow('.github/workflows/ci.yml');
  const auditJob = ciWorkflow.jobs.audit;
  const auditRunStep = findStep(auditJob.steps, 'Run Audits');
  const quarantineBudgetStep = findStep(auditJob.steps, 'Check E2E quarantine budget');

  assert.ok(auditRunStep);
  assert.match(auditRunStep.run, /test:ci:contracts.*playbook-contracts\.mjs/s);
  assert.match(auditRunStep.run, /\bpnpm check:e2e-contracts:base\b/);
  assert.match(auditRunStep.run, /\bpnpm lint:production-warnings\b/);
  assert.ok(quarantineBudgetStep);
  assert.equal(quarantineBudgetStep.run, 'pnpm check:e2e-quarantine-budget');
});

test('Composite CI setup action uses Node 24-compatible hosted actions', () => {
  const setupAction = readWorkflow('.github/actions/setup/action.yml');
  const steps = setupAction.runs.steps;

  assert.equal(findStep(steps, 'Setup Node').uses, 'actions/setup-node@v5');
  assert.equal(findStep(steps, 'Playwright Browser Cache').uses, 'actions/cache@v5');
});

test('V3 onboarding and env docs describe Paddle-only runtime and deploy proof secrets', () => {
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
  assert.equal(buildStagingJob.outputs.image_digest, '${{ steps.build.outputs.digest }}');
  const buildStagingStep = findStep(
    buildStagingJob.steps,
    'Build, attest, and verify Docker image'
  );
  assert.ok(buildStagingStep);
  assert.equal(buildStagingStep.id, 'build');
  assert.equal(buildStagingStep.uses, './.github/actions/build-attested-image');
  assert.equal(buildStagingStep.with['deploy-env'], 'staging');
  assert.equal(buildStagingStep.with['app-url'], 'https://staging.interdomestik.com');

  assert.ok(buildProductionJob);
  assert.deepEqual(normalizeNeeds(buildProductionJob.needs), ['e2e-staging']);
  assert.equal(buildProductionJob.environment.name, 'production');
  assert.equal(buildProductionJob.outputs.image_tag, '${{ steps.meta.outputs.version }}');
  assert.equal(buildProductionJob.outputs.image_digest, '${{ steps.build.outputs.digest }}');
  const buildProductionStep = findStep(
    buildProductionJob.steps,
    'Build, attest, and verify Docker image'
  );
  assert.ok(buildProductionStep);
  assert.equal(buildProductionStep.id, 'build');
  assert.equal(buildProductionStep.uses, './.github/actions/build-attested-image');
  assert.equal(buildProductionStep.with['deploy-env'], 'production');
  assert.equal(buildProductionStep.with['app-url'], 'https://app.interdomestik.com');

  assert.deepEqual(normalizeNeeds(deployStagingJob.needs), ['build-staging']);
  assert.equal(deployStagingJob.env.EXPECTED_COMMIT_SHA, '${{ github.sha }}');
  const triggerStagingDeployStep = findStep(deployStagingJob.steps, 'Trigger Staging Deploy');
  assert.ok(triggerStagingDeployStep);
  assert.equal(triggerStagingDeployStep.uses, './.github/actions/trigger-digest-verified-deploy');
  assert.equal(triggerStagingDeployStep.with.environment, 'staging');
  assert.match(triggerStagingDeployStep.with['webhook-url'], /INTERDOMESTIK_STAGING_DEPLOY/);
  assert.equal(
    triggerStagingDeployStep.with['image-tag'],
    '${{ needs.build-staging.outputs.image_tag }}'
  );
  assert.equal(
    triggerStagingDeployStep.with['image-digest'],
    '${{ needs.build-staging.outputs.image_digest }}'
  );
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
  const triggerProductionDeployStep = findStep(
    deployProductionJob.steps,
    'Trigger Production Deploy'
  );
  assert.ok(triggerProductionDeployStep);
  assert.equal(
    triggerProductionDeployStep.uses,
    './.github/actions/trigger-digest-verified-deploy'
  );
  assert.equal(triggerProductionDeployStep.with.environment, 'production');
  assert.match(triggerProductionDeployStep.with['webhook-url'], /INTERDOMESTIK_PRODUCTION_DEPLOY/);
  assert.equal(
    triggerProductionDeployStep.with['image-tag'],
    '${{ needs.build-production.outputs.image_tag }}'
  );
  assert.equal(
    triggerProductionDeployStep.with['image-digest'],
    '${{ needs.build-production.outputs.image_digest }}'
  );

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
