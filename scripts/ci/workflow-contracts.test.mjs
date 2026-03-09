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

test('CI includes a PR-only non-blocking AI eval lane keyed off AI file changes', () => {
  const ciWorkflow = readWorkflow('.github/workflows/ci.yml');
  const validationSurfaceJob = ciWorkflow.jobs['validation-surface'];
  const aiEvalJob = ciWorkflow.jobs['ai-eval'];

  assert.equal(
    validationSurfaceJob.outputs.ai_eval_should_run,
    '${{ steps.ai_eval_surface.outputs.should_run }}'
  );
  assert.equal(validationSurfaceJob.outputs.ai_eval_reason, '${{ steps.ai_eval_surface.outputs.reason }}');
  assert.equal(
    validationSurfaceJob.outputs.ai_eval_matched_paths,
    '${{ steps.ai_eval_surface.outputs.matched_paths }}'
  );
  assert.ok(findStep(validationSurfaceJob.steps, 'Evaluate AI eval surface'));

  assert.ok(aiEvalJob);
  assert.deepEqual(normalizeNeeds(aiEvalJob.needs), ['validation-surface']);
  assert.equal(
    aiEvalJob.if,
    "github.event_name == 'pull_request' && needs.validation-surface.outputs.ai_eval_should_run == 'true'"
  );
  assert.equal(aiEvalJob['continue-on-error'], true);
  assert.ok(findStep(aiEvalJob.steps, 'Explain AI eval surface'));
  const runStep = findStep(aiEvalJob.steps, 'Run AI eval fixtures');
  assert.ok(runStep);
  assert.equal(runStep.run, 'pnpm ai:eval');
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

  assert.deepEqual(secretScanWorkflow.on.push.branches, [
    'main',
    'master',
    'rc/**',
    'release/**',
  ]);
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

test('Heavy PR workflows skip runner startup for docs-only and planning-only changes', () => {
  const prE2eWorkflow = readWorkflow('.github/workflows/e2e-pr.yml');
  const pilotGateWorkflow = readWorkflow('.github/workflows/pilot-gate.yml');

  const expectedIgnoredPaths = [
    'docs/**',
    '.agent/**',
    'scripts/plan*.mjs',
    'README*',
    'CHANGELOG*',
    'CONTRIBUTING*',
    'LICENSE*',
  ];

  assert.deepEqual(prE2eWorkflow.on.pull_request['paths-ignore'], expectedIgnoredPaths);
  assert.deepEqual(pilotGateWorkflow.on.pull_request['paths-ignore'], expectedIgnoredPaths);
});

test('Pilot gate moves validation-surface, secrets, and PR Sonar checks into a lightweight preflight job', () => {
  const pilotGateWorkflow = readWorkflow('.github/workflows/pilot-gate.yml');
  const pilotGatePreflightJob = pilotGateWorkflow.jobs['pilot-gate-preflight'];

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
  assert.ok(findStep(preflightSteps, 'Evaluate validation surface'));
  assert.ok(findStep(preflightSteps, 'Validate required gate secrets'));
  assert.ok(findStep(preflightSteps, 'Await SonarCloud Code Analysis check'));
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
  assert.ok(setupIndex >= 0);
  assert.ok(manualSonarIndex >= 0);
  assert.ok(prepareDbIndex >= 0);
  assert.ok(buildIndex >= 0);
  assert.ok(setupIndex < prepareDbIndex);
  assert.ok(manualSonarIndex < prepareDbIndex);
  assert.ok(manualSonarIndex < buildIndex);
  assert.equal(findStep(steps, 'Evaluate validation surface'), undefined);
  assert.equal(findStep(steps, 'Validate required gate secrets'), undefined);
  assert.equal(findStep(steps, 'Await SonarCloud Code Analysis check'), undefined);
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

test('CI audit job runs the scripts/ci contract suite', () => {
  const ciWorkflow = readWorkflow('.github/workflows/ci.yml');
  const auditJob = ciWorkflow.jobs.audit;
  const auditRunStep = findStep(auditJob.steps, 'Run Audits');

  assert.ok(auditRunStep);
  assert.match(auditRunStep.run, /\bpnpm test:ci:contracts\b/);
});
