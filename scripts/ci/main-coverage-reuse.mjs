import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { readCoverageInputIdentity } from './coverage-input-identity.mjs';
import { decideMainCoverageReuse, normalizeReuseDecision } from './main-e2e-reuse-core.mjs';
import { collectGitHubEvidence, readLocalGitObjectId } from './main-e2e-reuse-github.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROOF_NAME = 'Coverage evidence ${{ steps.main_coverage_reuse.outputs.identity }}';

export function inspectCoverageParity(source) {
  const workflow = yaml.load(source);
  const unit = workflow?.jobs?.unit;
  const steps = unit?.steps ?? [];
  const checkout = steps.find(step => step.uses?.startsWith('actions/checkout@'));
  const coverage = steps.find(step => step.name === 'Coverage Gate');
  const proof = steps.find(step => step.name === PROOF_NAME);
  const measure = steps.find(step => step.id === 'main_coverage_reuse');
  return {
    // Coverage retains PR merge-ref testing. Its measured tree, not the source
    // branch head tree, must match main through the successful identity step.
    checkoutEvent: checkout?.with?.ref === '${{ github.sha }}',
    commandChain:
      coverage?.run === 'pnpm coverage:gate' &&
      coverage.id === 'coverage' &&
      coverage.env === undefined &&
      [measure, coverage, proof].every(
        step => step && step['working-directory'] === undefined && step.shell === undefined
      ) &&
      unit.defaults === undefined &&
      workflow.defaults === undefined &&
      measure?.env?.GITHUB_TOKEN === '${{ github.token }}' &&
      Object.keys(measure.env).length === 1 &&
      measure?.run === 'node scripts/ci/main-coverage-reuse.mjs >> "$GITHUB_OUTPUT"' &&
      steps.indexOf(measure) < steps.indexOf(coverage) &&
      !coverage['continue-on-error'] &&
      coverage.if ===
        "steps.main_coverage_reuse.outcome != 'success' || steps.main_coverage_reuse.outputs.reuse != 'true'" &&
      proof?.run === 'node scripts/ci/main-coverage-reuse.mjs assert-identity' &&
      proof.env?.EXPECTED_IDENTITY === '${{ steps.main_coverage_reuse.outputs.identity }}' &&
      Object.keys(proof.env).length === 1 &&
      proof.if ===
        "github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository && steps.coverage.outcome == 'success' && steps.main_coverage_reuse.outcome == 'success' && steps.main_coverage_reuse.outputs.identity != ''" &&
      steps.indexOf(proof) > steps.indexOf(coverage),
  };
}

export async function resolveMainCoverageReuse(env, dependencies = {}) {
  const reject = normalizeReuseDecision(null);
  try {
    const context = {
      eventName: env.GITHUB_EVENT_NAME,
      ref: env.GITHUB_REF,
      repository: env.GITHUB_REPOSITORY,
      githubSha: env.GITHUB_SHA,
      nowMs: dependencies.nowMs ?? Date.now(),
    };
    if (
      context.eventName !== 'push' ||
      context.ref !== 'refs/heads/main' ||
      context.repository !== 'interdomestik/interdomestik'
    )
      return reject;
    const git = dependencies.git ?? (revision => readLocalGitObjectId(root, revision));
    const local = { headSha: git('HEAD'), treeSha: git('HEAD^{tree}') };
    if (local.headSha !== context.githubSha) return reject;
    const parity = inspectCoverageParity(
      dependencies.source ?? readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')
    );
    if (!Object.values(parity).every(Boolean)) return reject;
    const identity = (dependencies.identity ?? (() => readCoverageInputIdentity(root, env)))();
    if (!/^[0-9a-f]{64}$/u.test(identity)) return reject;
    const remote = await (dependencies.collectEvidence ?? collectGitHubEvidence)({
      repositoryFullName: context.repository,
      githubSha: context.githubSha,
      token: env.GITHUB_TOKEN,
      workflowPath: '.github/workflows/ci.yml',
    });
    return decideMainCoverageReuse({ context, local, parity, identity, ...remote });
  } catch {
    return reject;
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command === 'assert-identity') {
    if (readCoverageInputIdentity(root) !== process.env.EXPECTED_IDENTITY) {
      throw new Error('Coverage inputs changed during execution');
    }
  } else if (command === undefined) {
    let identity = '';
    try {
      identity = readCoverageInputIdentity(root);
    } catch {
      /* Missing identity runs fresh coverage. */
    }
    const decision = await resolveMainCoverageReuse(process.env, { identity: () => identity });
    process.stdout.write(
      `identity=${identity}\nreuse=${decision.reuse}\nreason=${decision.reason}\n`
    );
  } else {
    throw new Error('Unknown coverage evidence command');
  }
}
