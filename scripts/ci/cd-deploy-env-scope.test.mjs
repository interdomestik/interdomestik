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
import { validatePreimageReceipt } from './configure-vercel-gate-url.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rootDir = root;
const read = file => yaml.load(fs.readFileSync(path.join(root, file), 'utf8'));
const readWorkflow = read;
const readRepoText = file => fs.readFileSync(path.join(root, file), 'utf8');
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
const findStepIndex = stepIndex;
const normalizeNeeds = needs =>
  Array.isArray(needs) ? needs : typeof needs === 'string' ? [needs] : [];
const TRUSTED_GATE_ACTION =
  'interdomestik/interdomestik/.github/actions/pr-gate-policy@f4b39fc4f7fed7e875363807faea11cc2c4cf717';
const WORKFLOWS_WITH_GENERATED_E2E_CREDENTIALS = [
  '.github/workflows/ci.yml',
  '.github/workflows/e2e-pr.yml',
  '.github/workflows/e2e-nightly.yml',
  '.github/workflows/release-candidate.yml',
  '.github/workflows/pilot-gate.yml',
  '.github/workflows/multi-agent-pr-hardening.yml',
];
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
  assert.match(rollbackIf, /needs\.scope\.result == 'success'/u);
  assert.match(rollbackIf, /needs\.scope\.outputs\.deploy == 'true'/u);
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
  const orderContracts = [
    ['.github/workflows/ci.yml', 'e2e-gate', 'Prepare E2E Database'],
    ['.github/workflows/e2e-pr.yml', 'e2e-runner', 'Run PR E2E Gate'],
    ['.github/workflows/e2e-nightly.yml', 'e2e', 'Seed E2E DB'],
    ['.github/workflows/release-candidate.yml', 'rc-gate', 'Prepare CI database'],
    ['.github/workflows/pilot-gate.yml', 'pilot-gate-runner', 'Prepare CI database'],
    [
      '.github/workflows/multi-agent-pr-hardening.yml',
      'multi-agent-pr-hardening',
      'Prepare CI database',
    ],
  ];
  for (const [workflowPath, jobName, guardedStep] of orderContracts) {
    const steps = readWorkflow(workflowPath).jobs[jobName].steps;
    const generatedIndex = findStepIndex(steps, 'Generate ephemeral E2E credentials');
    assert.ok(generatedIndex < findStepIndex(steps, guardedStep));
  }
});
test('CI materializes AI eval as a blocking surface-gated lane', () => {
  const ciWorkflow = readWorkflow('.github/workflows/ci.yml');
  const validationSurfaceJob = ciWorkflow.jobs['validation-surface'];
  const aiEvalJob = ciWorkflow.jobs['ai-eval'];
  for (const output of ['ai_eval_should_run', 'ai_eval_reason', 'ai_eval_matched_paths']) {
    assert.equal(
      validationSurfaceJob.outputs[output],
      `\${{ steps.gate_policy.outputs.${output} }}`
    );
  }
  const gatePolicyStep = findStep(validationSurfaceJob.steps, 'Evaluate PR gate policy');
  assert.ok(gatePolicyStep);
  assert.equal(gatePolicyStep.uses, TRUSTED_GATE_ACTION);
  assert.ok(aiEvalJob);
  assert.ok(normalizeNeeds(aiEvalJob.needs).includes('validation-surface'));
  assert.equal(
    aiEvalJob.if,
    "needs.validation-surface.outputs.run_broad == 'true' && needs.validation-surface.outputs.ai_eval_should_run == 'true'"
  );
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
test('CI audit job runs the scripts/ci contract suite', () => {
  const ciWorkflow = readWorkflow('.github/workflows/ci.yml');
  const auditJob = ciWorkflow.jobs.audit;
  const auditRunStep = findStep(auditJob.steps, 'Run Audits');
  const standaloneBudgetSteps = auditJob.steps.filter(
    step => step?.run?.trim() === 'pnpm check:e2e-quarantine-budget'
  );
  assert.ok(auditRunStep);
  assert.match(auditRunStep.run, /\bpnpm test:ci:contracts\b/);
  assert.doesNotMatch(auditRunStep.run, /playbook-contracts\.mjs/);
  assert.match(auditRunStep.run, /\bpnpm check:e2e-contracts\b/);
  assert.match(auditRunStep.run, /\bpnpm lint:production-warnings\b/);
  assert.equal(standaloneBudgetSteps.length, 0);
});
test('Secret Scan is the sole blocking gitleaks surface for PR and mainline while Security stays pnpm-audit-only', () => {
  const secretScanWorkflow = readWorkflow('.github/workflows/secret-scan.yml');
  const securityWorkflow = readWorkflow('.github/workflows/security.yml');
  assert.deepEqual(secretScanWorkflow.on.schedule, [{ cron: '0 6 * * 1' }]);
  assert.deepEqual(secretScanWorkflow.on.push.branches, ['main', 'master', 'rc/**', 'release/**']);
  assert.deepEqual(secretScanWorkflow.on.pull_request.branches, ['**']);

  const gitleaksJob = secretScanWorkflow.jobs.gitleaks;
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
  for (const name of [
    'Install gitleaks CLI',
    'Run gitleaks (blocking)',
    'Upload gitleaks report artifact',
  ]) {
    assert.equal(findStep(securityAuditJob.steps, name), undefined);
  }
});
