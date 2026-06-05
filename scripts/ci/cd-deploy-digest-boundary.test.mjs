import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cdWorkflow = yaml.load(
  fs.readFileSync(path.join(rootDir, '.github/workflows/cd.yml'), 'utf8')
);
const deployAction = yaml.load(
  fs.readFileSync(
    path.join(rootDir, '.github/actions/trigger-digest-verified-deploy/action.yml'),
    'utf8'
  )
);

function findStep(steps, name) {
  return steps.find(step => step?.name === name);
}

function findStepIndex(steps, name) {
  return steps.findIndex(step => step?.name === name);
}

function assertBuildDigestOutput(jobName) {
  const job = cdWorkflow.jobs[jobName];
  assert.ok(job, `${jobName} must exist`);
  assert.equal(job.outputs.image_digest, '${{ steps.build.outputs.digest }}');
}

function assertDeployDigestBoundary({ jobName, buildJobName, stepName, environmentName }) {
  const job = cdWorkflow.jobs[jobName];
  assert.ok(job, `${jobName} must exist`);

  const step = findStep(job.steps, stepName);
  assert.ok(step, `${jobName} must trigger deployment`);
  assert.ok(findStepIndex(job.steps, 'Checkout repository') < findStepIndex(job.steps, stepName));
  assert.equal(step.uses, './.github/actions/trigger-digest-verified-deploy');
  assert.equal(step.with.environment, environmentName);
  assert.equal(step.with['image-tag'], `\${{ needs.${buildJobName}.outputs.image_tag }}`);
  assert.equal(step.with['image-digest'], `\${{ needs.${buildJobName}.outputs.image_digest }}`);
  assert.equal(step.with.sha, '${{ github.sha }}');
}

function assertDeployActionDigestVerification() {
  const step = findStep(deployAction.runs.steps, 'Trigger deploy webhook');
  assert.ok(step, 'deploy action must trigger the webhook');
  assert.equal(step.env.IMAGE_DIGEST, '${{ inputs.image-digest }}');
  assert.match(step.run, /"image_digest":"%s"/u);
  assert.match(step.run, /missing\+=\("webhook-url"\)/u);
  assert.match(step.run, /missing\+=\("image-digest"\)/u);
  assert.match(step.run, /--connect-timeout 10 --max-time 120/u);
  assert.match(step.run, /\$\{IMAGE_DIGEST\}/u);
  assert.match(step.run, /DEPLOY_WEBHOOK_RESPONSE_FILE/u);
  assert.match(step.run, /try \{\s+response = JSON\.parse\(raw\);/u);
  assert.match(step.run, /deploy webhook must confirm image_digest in JSON/u);
  assert.match(step.run, /response\?\.image_digest/u);
  assert.match(step.run, /deploy digest mismatch/u);
  assert.match(step.run, /deploy webhook confirmed image digest/u);
  return step.run;
}

function extractDigestVerifierScript(runScript) {
  const match = runScript.match(/node --input-type=module <<'NODE'\n([\s\S]+?)\nNODE/u);
  assert.ok(match, 'deploy action must keep digest verifier in a node heredoc');
  return match[1].replace(/^ {2}/gmu, '');
}

function runDigestVerifier(script, responseBody) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-digest-'));
  const responseFile = path.join(tempDir, 'response.json');
  fs.writeFileSync(responseFile, responseBody);
  try {
    return spawnSync(process.execPath, ['--input-type=module'], {
      input: script,
      encoding: 'utf8',
      env: {
        ...process.env,
        DEPLOY_ENVIRONMENT: 'staging',
        DEPLOY_WEBHOOK_RESPONSE_FILE: responseFile,
        IMAGE_DIGEST: 'sha256:expected',
      },
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function assertDigestVerifierRejects(script, responseBody, expectedMessage) {
  const result = runDigestVerifier(script, responseBody);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr.toString(), expectedMessage);
}

test('CD deploy boundary requires immutable image digest confirmation', () => {
  assertBuildDigestOutput('build-staging');
  assertBuildDigestOutput('build-production');
  assertDeployDigestBoundary({
    jobName: 'deploy-staging',
    buildJobName: 'build-staging',
    stepName: 'Trigger Staging Deploy',
    environmentName: 'staging',
  });
  assertDeployDigestBoundary({
    jobName: 'deploy-production',
    buildJobName: 'build-production',
    stepName: 'Trigger Production Deploy',
    environmentName: 'production',
  });
  const verifierScript = extractDigestVerifierScript(assertDeployActionDigestVerification());
  const success = runDigestVerifier(verifierScript, '{"image_digest":"sha256:expected"}');
  assert.equal(success.status, 0);
  assert.match(success.stdout, /confirmed image digest/u);
  assertDigestVerifierRejects(
    verifierScript,
    '{"image_digest":"sha256:other"}',
    /deploy digest mismatch/u
  );
  assertDigestVerifierRejects(verifierScript, '{"status":"ok"}', /got missing/u);
  assertDigestVerifierRejects(verifierScript, 'not json', /must confirm image_digest in JSON/u);
});
