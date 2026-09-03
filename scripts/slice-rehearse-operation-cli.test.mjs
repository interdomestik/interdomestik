import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from './slice-rehearse-canonical.mjs';
import {
  OPERATION_ARTIFACT_ROOT,
  operationApprovalBinding,
  operationBodyArtifact,
} from './slice-rehearse-operation-certificate.mjs';
import { collectOperationFacts } from './slice-rehearse-operation-facts.mjs';
import { resolveDeferredOperation } from './slice-rehearse-operation-facts-schema.mjs';
import { runSliceRehearsal } from './slice-rehearse.mjs';

const GIT = '/usr/bin/git';
const ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });

// prettier-ignore
test('private operation artifacts', () => { assert.equal(OPERATION_ARTIFACT_ROOT, join(homedir(), '.cache', 'interdomestik-harness-operations')); assert.equal(OPERATION_ARTIFACT_ROOT.startsWith('/private/tmp/'), false); assert.equal(operationBodyArtifact({ artifacts: { 'pr/body.md': 'a'.repeat(64) } }, 'pr/body.md'), join(OPERATION_ARTIFACT_ROOT, 'pr/body.md')); });

function git(repository, ...args) {
  return execFileSync(GIT, args, { cwd: repository, encoding: 'utf8', env: ENV }).trim();
}

function budget(protectedMainSha) {
  // prettier-ignore
  const categories = Object.fromEntries('config/data/messages|docs/text|large support/generated-ish|other|source/scripts|tests/e2e'.split('|').map(category => [category, 1]));
  // prettier-ignore
  return { version: 2, baseline: { protectedMainSha, trackedBytes: 6, trackedFiles: 1, categoryBytes: categories }, allocations: [{ id: 'fixture', mode: 'exact', writerPaths: ['declared.txt'], trackedBytesDelta: 0, trackedFilesDelta: 0, categoryBytesDelta: {}, pathBytesDelta: { 'declared.txt': 0 } }], reserve: { trackedBytes: 0, trackedFiles: 0, categoryBytes: {}, rationale: 'No fixture reserve is needed.' }, maxTrackedBytes: 6, maxTrackedFiles: 1, maxCategoryBytes: categories, maxLargestFileBytes: 1024, maxSourceOrTestLines: 100 };
}

// prettier-ignore
function fixture() { const root = mkdtempSync(join(tmpdir(), 'slice-operation-cli-')), repository = join(root, 'repo'); execFileSync(GIT, ['init', '-q', '-b', 'codex/harness-v2-cli', repository], { env: ENV }); git(repository, 'config', 'user.email', 'harness@example.test'); git(repository, 'config', 'user.name', 'Harness Test'); git(repository, 'remote', 'add', 'origin', 'https://github.com/interdomestik/interdomestik.git'); execFileSync('/bin/mkdir', ['-p', join(repository, 'scripts')], { env: ENV }); writeFileSync(join(repository, 'declared.txt'), 'base\n'); writeFileSync(join(repository, 'scripts/repo-size-budget.json'), canonicalJson(budget('0'.repeat(40)))); git(repository, 'add', '.'); git(repository, 'commit', '-q', '-m', 'baseline'); const baseline = git(repository, 'rev-parse', 'HEAD'); writeFileSync(join(repository, 'scripts/repo-size-budget.json'), canonicalJson(budget(baseline))); git(repository, 'add', '.'); git(repository, 'commit', '-q', '-m', 'budget'); return { root, repository, headSha: git(repository, 'rev-parse', 'HEAD') }; }

// prettier-ignore
function manifest(baseSha) { return { schemaVersion: 1, sliceId: 'HARNESS-V2-CLI', tier: 3, baseSha, origin: 'https://github.com/interdomestik/interdomestik.git', writerPaths: ['declared.txt'], pathPlans: [{ path: 'declared.txt', change: 'modify', category: 'docs/text', maxBytesDelta: 32, maxLines: 10 }], routineOperations: [{ operation: 'apply_full_gate_label', target: { mode: 'deferred-pr', origin: 'https://github.com/interdomestik/interdomestik', baseBranch: 'main', branch: 'codex/harness-v2-cli', label: 'full-gate', taskId: 'HARNESS-V2-CLI' }, preconditions: { uniquePullRequest: true, headEqualsBranchHead: true, resolverWriterIdentity: true, labelAbsent: true } }], proof: { commands: ['node --test'], heavyLanes: [], fullGateRequired: true, workflowDigest: 'a'.repeat(64), substrateDigest: 'b'.repeat(64) }, evidenceReceipts: [], topology: { closeoutMode: 'none', projectionPaths: [], repairPaths: [], repairAllocationId: null } }; }

// prettier-ignore
test('pre-PR predicate', () => { const value = fixture(); try { const manifestPath = join(value.root, 'manifest.json'), output = []; writeFileSync(manifestPath, canonicalJson(manifest(value.headSha))); const exitCode = runSliceRehearsal({ argv: ['--manifest', manifestPath], cwd: value.repository, readProtectedMain: () => value.headSha, collectVerifiedEvidence: () => ({}), collectOperations: args => collectOperationFacts({ ...args, readGithub: () => [], readAuthority: () => ({ activeSlice: null, approvedHeadSha: null, runtimeAuthorized: false, writerMapDigest: null }) }), stdout: chunk => output.push(chunk), stderr: error => assert.fail(error) }), report = JSON.parse(output.join('')); assert.equal(exitCode, 2); assert.equal(report.writers.routineOperations[0].deferred, true); assert.deepEqual(report.repository.operationFacts.pullRequestCandidates, { 'codex/harness-v2-cli': [] }); assert.equal(report.authorityStops.some(item => item.code === 'envelope:operation-precondition-unverified'), false); } finally { rmSync(value.root, { recursive: true, force: true }); } });

// prettier-ignore
test('review regressions', () => { const branch = 'codex/harness-v2-cli', contract = { deferred: false, resolvedPrNumber: 1689, target: { branch, taskId: 'HARNESS-V2-CLI' } }, authority = { activeSlice: null, approvedHeadSha: null, runtimeAuthorized: false }; assert.deepEqual(resolveDeferredOperation(contract, { writerMapDigest: 'a' }, { authority, pullRequestCandidates: { [branch]: [] } }), { rejected: 'deferred-predicate-unresolved' }); assert.notEqual(operationApprovalBinding({ allowedOperations: ['stale_pr_disposition'], reportSha256: 'a' }), operationApprovalBinding({ allowedOperations: ['stale_pr_disposition'], reportSha256: 'b' })); });

test('CLI binds T117B closure before repository facts', () => {
  const value = fixture();
  try {
    const admission = JSON.parse(
      readFileSync(
        new URL('../docs/plans/2026-08-28-t117b-cutover-admission.json', import.meta.url)
      )
    );
    const seed = {
      ...manifest(value.headSha),
      sliceId: 'T117B-CUTOVER',
      writerPaths: admission.writerPaths,
      pathPlans: admission.writerPaths.map(path => ({
        path,
        change: 'modify',
        category: path.endsWith('.json')
          ? 'config/data/messages'
          : path.includes('/e2e/') || path.endsWith('.test.tsx')
            ? 'tests/e2e'
            : 'source/scripts',
        maxBytesDelta: 8_192,
        maxLines: 300,
      })),
      routineOperations: [],
      proof: { ...manifest(value.headSha).proof, fullGateRequired: false },
    };
    const manifestPath = join(value.root, 't117b.json');
    writeFileSync(manifestPath, canonicalJson(seed));
    let collected;
    const exitCode = runSliceRehearsal({
      argv: ['--manifest', manifestPath],
      cwd: value.repository,
      readProtectedMain: () => value.headSha,
      collectFacts: input => {
        collected = input;
        return { root: value.repository };
      },
      collectOperations: () => null,
      collectVerifiedEvidence: () => ({}),
      evaluate: ({ manifest: compiled }) => {
        assert.deepEqual(compiled.writerPaths, admission.writerPaths);
        assert.deepEqual(compiled.writerPaths, collected.writerPaths);
        return { authorityStops: [] };
      },
      stdout: () => {},
      stderr: error => assert.fail(error),
    });
    assert.equal(exitCode, 0);
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});
