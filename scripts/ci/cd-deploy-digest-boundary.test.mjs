import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cdWorkflow = readYaml('.github/workflows/cd.yml');
const deployAction = readYaml('.github/actions/trigger-digest-verified-deploy/action.yml');

function readYaml(relativePath) {
  return yaml.load(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function findStep(steps, name) {
  return steps.find(step => step?.name === name);
}

function findStepIndex(steps, name) {
  return steps.findIndex(step => step?.name === name);
}

function assertVercelDeployBoundary({
  jobName,
  buildJobName,
  stepName,
  environmentName,
  production,
  outputsBaseUrl,
}) {
  const job = cdWorkflow.jobs[jobName];
  assert.ok(job, `${jobName} must exist`);
  if (outputsBaseUrl) {
    assert.equal(job.outputs.base_url, '${{ steps.vercel.outputs.base_url }}');
    assert.equal(job.outputs.hostname, '${{ steps.vercel.outputs.hostname }}');
    assert.equal(job.outputs.gate_base_url, '${{ steps.vercel.outputs.gate_base_url }}');
    assert.equal(job.outputs.gate_hostname, '${{ steps.vercel.outputs.gate_hostname }}');
  }

  const step = findStep(job.steps, stepName);
  assert.ok(step, `${jobName} must deploy through Vercel`);
  assert.ok(findStepIndex(job.steps, 'Checkout repository') < findStepIndex(job.steps, stepName));
  assert.equal(step.id, 'vercel');
  assert.equal(step.uses, './.github/actions/trigger-digest-verified-deploy');
  assert.equal(step.with.environment, environmentName);
  assert.equal(step.with.production, production);
  assert.equal(step.with['commit-sha'], '${{ github.sha }}');
  assert.equal(step.with['canonical-url'], undefined);
  assert.equal(step.env.ENABLE_VERCEL_DEPLOYMENTS, '1');
  assert.equal(step.env.DATABASE_URL, '${{ secrets.DATABASE_URL }}');
  assert.equal(step.env.DATABASE_URL_RLS, '${{ secrets.DATABASE_URL_RLS }}');
  assert.match(step.env.VERCEL_TOKEN, /secrets\.VERCEL_TOKEN/);
  assert.equal(step.env.VERCEL_ORG_ID, '${{ vars.VERCEL_ORG_ID }}');
  assert.equal(step.env.VERCEL_PROJECT_ID, '${{ vars.VERCEL_PROJECT_ID }}');
  assert.equal(step.env.VERCEL_AUTOMATION_BYPASS_SECRET, undefined);
  assert.match(step.with['vercel-automation-bypass-secret'], /secrets\.VERCEL_AUTOMATION/u);
  assert.equal(
    step.with['attested-image-digest'],
    '${{ needs.' + buildJobName + '.outputs.image_digest }}'
  );

  for (const key of [
    'VERCEL_TOKEN',
    'VERCEL_ORG_ID',
    'VERCEL_PROJECT_ID',
    'DATABASE_URL',
    'DATABASE_URL_RLS',
    'VERCEL_AUTOMATION_BYPASS_SECRET',
  ]) {
    assert.equal(job.env?.[key], undefined);
  }
}

test('CD deploy boundary uses Vercel prebuilt deployments after attested builds', () => {
  assertVercelDeployBoundary({
    jobName: 'deploy-staging',
    buildJobName: 'build-staging',
    stepName: 'Deploy Staging to Vercel',
    environmentName: 'staging',
    production: 'false',
    outputsBaseUrl: true,
  });
  assertVercelDeployBoundary({
    jobName: 'deploy-production',
    buildJobName: 'build-production',
    stepName: 'Deploy Production to Vercel',
    environmentName: 'production',
    production: 'true',
    outputsBaseUrl: false,
  });
});

test('Vercel deploy action validates config, builds, deploys, and exports base URL', () => {
  const steps = deployAction.runs.steps;
  const validateStep = findStep(steps, 'Validate Vercel configuration');
  const pullStep = findStep(steps, 'Pull Vercel environment');
  const buildStep = findStep(steps, 'Build Vercel artifact');
  const renamedDigestStep = findStep(steps, 'Write Vercel output attestation metadata');
  const attestStep = findStep(steps, 'Attest Vercel output artifact');
  const deployStep = findStep(steps, 'Deploy Vercel artifact');
  const cleanupStep = findStep(steps, 'Clean Vercel environment cache');

  assert.equal(deployAction.inputs['commit-sha'].required, true);
  assert.equal(deployAction.inputs['attested-image-digest'].required, true);
  assert.equal(deployAction.inputs['vercel-automation-bypass-secret'].required, false);
  assert.equal(deployAction.outputs.vercel_output_digest.value, '${{ steps.deploy.outputs.vercel_output_digest }}');
  assert.equal(deployAction.outputs.gate_base_url.value, '${{ steps.deploy.outputs.gate_base_url }}');
  assert.equal(deployAction.outputs.gate_hostname.value, '${{ steps.deploy.outputs.gate_hostname }}');
  assert.match(validateStep.run, /VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID/u);
  assert.match(validateStep.run, /ENABLE_VERCEL_DEPLOYMENTS=1/u);
  assert.match(pullStep.run, /vercel@latest pull/u);
  assert.match(pullStep.run, /vercel_env=.*staging.*preview/u);
  assert.match(pullStep.run, /--environment="\$\{vercel_env\}"/u);
  assert.match(pullStep.run, /if \[\[ "\$\{vercel_env\}" == preview \]\]; then/u);
  assert.match(pullStep.run, /GITHUB_REF_TYPE:-.*tag[\s\S]*--git-branch="\$\{preview_branch\}"/u);
  assert.match(buildStep.run, /run-with-vercel-env-file\.mjs "\$\{deploy_target\}"/u);
  assert.match(buildStep.run, /deploy_target=.*staging.*preview[\s\S]*deploy_target=production/u);
  assert.match(buildStep.run, /target_args=\(\)/u);
  assert.match(buildStep.run, /target_args=\(--prod\)/u);
  assert.equal(renamedDigestStep.id, 'artifact');
  assert.match(renamedDigestStep.run, /hash-vercel-output\.mjs/u);
  assert.match(renamedDigestStep.run, /interdomestik-release-attestation\.json/u);
  assert.match(renamedDigestStep.run, /vercelOutputDigest/u);
  assert.match(renamedDigestStep.env.SOURCE_IMAGE_DIGEST, /inputs\.attested-image-digest/u);
  assert.match(attestStep.uses, /^actions\/attest@[a-f0-9]{40}$/u);
  assert.equal(attestStep.with['subject-name'], 'vercel-output/${{ inputs.environment }}');
  assert.equal(attestStep.with['subject-digest'], '${{ steps.artifact.outputs.vercel_output_digest }}');
  assert.equal(deployStep.id, 'deploy');
  assert.match(deployStep.env.VERCEL_AUTOMATION_BYPASS_SECRET, /inputs\.vercel-automation-bypass-secret/u);
  assert.match(deployStep.run, /current_vercel_output_digest="\$\(node scripts\/ci\/hash-vercel-output\.mjs\)"/u);
  assert.match(deployStep.run, /Vercel output digest changed after attestation/u);
  assert.match(deployStep.run, /-- deploy --yes --prebuilt/u);
  assert.match(deployStep.run, /VERCEL_DEPLOY_TIMEOUT_SECONDS:-900/u);
  assert.match(deployStep.run, /run-vercel-deploy-with-timeout\.mjs/u);
  assert.match(deployStep.run, /--archive=tgz/u);
  assert.match(deployStep.run, /--env "COMMIT_SHA=\$\{COMMIT_SHA\}"/u);
  assert.match(deployStep.run, /deploy_target=.*staging.*preview/u);
  assert.match(deployStep.run, /--target="\$\{deploy_target\}"/u);
  assert.match(deployStep.run, /base_url="\$\{deployment_url\}"/u);
  assert.match(deployStep.run, /metadata_url="\$\{base_url\}\/\.well-known\/interdomestik-release-attestation\.json"/u);
  assert.match(deployStep.run, /configure-vercel-gate-url\.mjs "\$\{base_url\}" "\$\{hostname\}"/u);
  assert.doesNotMatch(deployStep.run, /--token/u);
  assert.match(deployStep.run, /interdomestik-release-attestation\.json[\s\S]*VERCEL_AUTOMATION_BYPASS_SECRET="\$\{VERCEL_AUTOMATION_BYPASS_SECRET:-\}" node scripts\/ci\/fetch-vercel-attestation\.mjs/u);
  assert.match(deployStep.run, /verify-vercel-attestation\.mjs/u);
  assert.match(deployStep.run, /vercel_output_digest=/u);
  assert.equal(cleanupStep.if, '${{ always() }}');
  assert.match(cleanupStep.run, /rm -rf \.vercel/u);
});
