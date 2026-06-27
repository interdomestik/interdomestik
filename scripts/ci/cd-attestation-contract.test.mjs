import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cdWorkflow = readYaml('.github/workflows/cd.yml');
const attestedImageAction = readYaml('.github/actions/build-attested-image/action.yml');

function readYaml(relativePath) {
  return yaml.load(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function findStep(steps, name) {
  return steps.find(step => step?.name === name);
}

function findStepIndex(steps, name) {
  return steps.findIndex(step => step?.name === name);
}

function assertSupplyChainBuildJob(jobName, environmentName) {
  const job = cdWorkflow.jobs[jobName];
  assert.ok(job, `${jobName} must exist`);
  assert.equal(job.environment.name, environmentName);
  assert.equal(job.permissions.contents, 'read');
  assert.equal(job.permissions.packages, 'write');
  assert.equal(job.permissions['id-token'], 'write');
  assert.equal(job.permissions.attestations, 'write');
  assert.equal(job.outputs.image_tag, '${{ steps.meta.outputs.version }}');
  assert.equal(job.outputs.image_digest, '${{ steps.build.outputs.digest }}');

  const buildStep = findStep(job.steps, 'Build, attest, and verify Docker image');
  assert.ok(buildStep, `${jobName} must use the attested image action`);
  assert.equal(buildStep.id, 'build');
  assert.equal(buildStep.uses, './.github/actions/build-attested-image');
  assert.equal(buildStep.with['deploy-env'], environmentName);
  assert.match(buildStep.with['supabase-url'], /\$\{\{\s*(vars|secrets)\.NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(
    buildStep.with['supabase-anon-key'],
    /\$\{\{\s*(vars|secrets)\.NEXT_PUBLIC_SUPABASE_ANON_KEY/
  );
  assert.match(
    buildStep.with['supabase-production-project-ref'],
    /\$\{\{\s*(vars|secrets)\.SUPABASE_PRODUCTION_PROJECT_REF/
  );
}

function assertAttestedImageAction() {
  assert.equal(attestedImageAction.outputs.digest.value, '${{ steps.build.outputs.digest }}');
  const steps = attestedImageAction.runs.steps;
  const buildStep = findStep(steps, 'Build and push Docker image');
  assert.ok(buildStep, 'attested image action must build and push the image');
  assert.match(buildStep.uses, /^docker\/build-push-action@[a-f0-9]{40}$/u);
  assert.equal(buildStep.id, 'build');
  assert.equal(buildStep.with.push, true);
  assert.equal(buildStep.with.provenance, 'mode=max');
  assert.equal(buildStep.with.sbom, true);
  assert.equal(buildStep.with['cache-from'], undefined);
  assert.equal(buildStep.with['cache-to'], undefined);
  assert.match(buildStep.with.tags, /\$\{\{\s*inputs\.tags\s*\}\}/u);
  assert.match(buildStep.with['build-args'], /COMMIT_SHA=\$\{\{\s*github\.sha\s*\}\}/u);
  assert.match(
    buildStep.with['build-args'],
    /INTERDOMESTIK_DEPLOY_ENV=\$\{\{\s*inputs\.deploy-env\s*\}\}/u
  );
  assert.match(
    buildStep.with['build-args'],
    /NEXT_PUBLIC_SUPABASE_URL=\$\{\{\s*inputs\.supabase-url\s*\}\}/u
  );
  assert.match(
    buildStep.with['build-args'],
    /NEXT_PUBLIC_SUPABASE_ANON_KEY=\$\{\{\s*inputs\.supabase-anon-key\s*\}\}/u
  );
  assert.match(
    buildStep.with['build-args'],
    /SUPABASE_PRODUCTION_PROJECT_REF=\$\{\{\s*inputs\.supabase-production-project-ref\s*\}\}/u
  );
  assert.match(
    buildStep.with['build-args'],
    /NEXT_PUBLIC_APP_URL=\$\{\{\s*inputs\.app-url\s*\}\}/u
  );

  const sbomStep = findStep(steps, 'Generate Image SBOM');
  const attestStep = findStep(steps, 'Attest Image Build Provenance');
  const attestSbomStep = findStep(steps, 'Attest Image SBOM');
  const verifyStep = findStep(steps, 'Verify Signed Provenance And SBOM');
  assert.ok(sbomStep, 'attested image action must generate an image SBOM');
  assert.ok(attestStep, 'attested image action must create signed provenance');
  assert.ok(attestSbomStep, 'attested image action must create a signed SBOM attestation');
  assert.ok(verifyStep, 'attested image action must verify signed provenance and SBOM');
  assert.match(sbomStep.uses, /^anchore\/sbom-action@[a-f0-9]{40}$/u);
  assert.equal(sbomStep.env.SYFT_PLATFORM, 'linux/amd64');
  assert.equal(sbomStep.with.format, 'spdx-json');
  assert.equal(sbomStep.with['output-file'], 'image.sbom.spdx.json');
  assert.equal(sbomStep.with['upload-artifact'], false);
  assert.match(attestStep.uses, /^actions\/attest@[a-f0-9]{40}$/u);
  assert.equal(attestStep.with['subject-name'], '${{ inputs.registry }}/${{ inputs.image-name }}');
  assert.equal(attestStep.with['subject-digest'], '${{ steps.build.outputs.digest }}');
  assert.equal(attestStep.with['push-to-registry'], true);
  assert.match(attestSbomStep.uses, /^actions\/attest@[a-f0-9]{40}$/u);
  assert.equal(attestSbomStep.with['sbom-path'], 'image.sbom.spdx.json');
  assert.equal(attestSbomStep.with['push-to-registry'], true);
  assert.equal(verifyStep.env.GH_TOKEN, '${{ github.token }}');
  assert.match(verifyStep.env.IMAGE_REF, /steps\.build\.outputs\.digest/u);
  assert.match(verifyStep.run, /gh attestation verify "oci:\/\/\$\{IMAGE_REF\}"/u);
  assert.match(verifyStep.run, /-R "\$\{GITHUB_REPOSITORY\}"/u);
  assert.match(verifyStep.run, /--source-digest "\$\{GITHUB_SHA\}"/u);
  assert.match(verifyStep.run, /--source-ref "\$\{GITHUB_REF\}"/u);
  assert.match(verifyStep.run, /--signer-workflow "\$\{signer_workflow\}"/u);
  assert.match(verifyStep.run, /--predicate-type https:\/\/spdx\.dev\/Document\/v2\.3/u);
  assert.ok(findStepIndex(steps, buildStep.name) < findStepIndex(steps, sbomStep.name));
  assert.ok(findStepIndex(steps, sbomStep.name) < findStepIndex(steps, attestStep.name));
  assert.ok(findStepIndex(steps, attestStep.name) < findStepIndex(steps, attestSbomStep.name));
  assert.ok(findStepIndex(steps, attestSbomStep.name) < findStepIndex(steps, verifyStep.name));
}

test('CD release images emit SBOM, signed provenance, and verified immutable digests', () => {
  assertSupplyChainBuildJob('build-staging', 'staging');
  assertSupplyChainBuildJob('build-production', 'production');
  assertAttestedImageAction();
});
