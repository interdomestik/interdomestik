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

test('CI PR path keeps only RLS coverage while PR E2E owns browser validation', () => {
  const ciWorkflow = readWorkflow('.github/workflows/ci.yml');
  const prE2eWorkflow = readWorkflow('.github/workflows/e2e-pr.yml');

  const ciE2eGateJob = ciWorkflow.jobs['e2e-gate'];
  const ciSteps = ciE2eGateJob.steps;

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

  const prE2eJob = prE2eWorkflow.jobs.e2e;
  const prE2eSetupStep = prE2eJob.steps.find(step => step?.uses === './.github/actions/setup');
  assert.equal(prE2eSetupStep.with['install-playwright'], true);
  assert.ok(findStep(prE2eJob.steps, 'Generate Playwright Gate Auth State (KS+MK)'));
  assert.ok(findStep(prE2eJob.steps, 'E2E Subscription Lifecycle (KS+MK)'));
  assert.ok(findStep(prE2eJob.steps, 'E2E Smoke Suite (KS+MK)'));
});

test('Heavy PR workflows skip runner startup for non-product-only changes', () => {
  const prE2eWorkflow = readWorkflow('.github/workflows/e2e-pr.yml');
  const pilotGateWorkflow = readWorkflow('.github/workflows/pilot-gate.yml');

  const expectedIgnoredPaths = [
    'docs/**',
    '.agent/**',
    '.github/workflows/**',
    '.github/actions/**',
    'scripts/plan*.mjs',
    'README*',
    'CHANGELOG*',
    'CONTRIBUTING*',
    'LICENSE*',
  ];

  assert.deepEqual(prE2eWorkflow.on.pull_request['paths-ignore'], expectedIgnoredPaths);
  assert.deepEqual(pilotGateWorkflow.on.pull_request['paths-ignore'], expectedIgnoredPaths);
});

test('Pilot gate fails fast on Sonar and secrets before dependency install and build', () => {
  const pilotGateWorkflow = readWorkflow('.github/workflows/pilot-gate.yml');
  const pilotGateJob = pilotGateWorkflow.jobs['pilot-gate'];
  const steps = pilotGateJob.steps;

  const setupIndex = steps.findIndex(step => step?.uses === './.github/actions/setup');
  const validateSecretsIndex = findStepIndex(steps, 'Validate required gate secrets');
  const awaitSonarIndex = findStepIndex(steps, 'Await SonarCloud Code Analysis check');
  const manualSonarIndex = findStepIndex(steps, 'Run Sonar quality gate (manual fallback)');
  const prepareDbIndex = findStepIndex(steps, 'Prepare CI database');
  const buildIndex = findStepIndex(steps, 'Build web standalone artifact');

  assert.ok(validateSecretsIndex >= 0);
  assert.ok(awaitSonarIndex >= 0);
  assert.ok(manualSonarIndex >= 0);
  assert.ok(setupIndex >= 0);
  assert.ok(prepareDbIndex >= 0);
  assert.ok(buildIndex >= 0);

  assert.ok(validateSecretsIndex < setupIndex);
  assert.ok(awaitSonarIndex < setupIndex);
  assert.ok(manualSonarIndex < prepareDbIndex);
  assert.ok(awaitSonarIndex < prepareDbIndex);
  assert.ok(manualSonarIndex < buildIndex);
});
