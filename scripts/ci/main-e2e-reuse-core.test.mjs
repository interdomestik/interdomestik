import assert from 'node:assert/strict';
import test from 'node:test';
import { decideMainE2eReuse, normalizeReuseDecision } from './main-e2e-reuse-core.mjs';
import {
  HEAD_SHA,
  MAIN_SHA,
  REPOSITORY,
  directAssociation,
  reusableEvidence,
  strictSchemaRejectionCases,
} from './main-e2e-reuse-fixture.mjs';
const reject = { reuse: false, reason: 'evidence_not_exact' };
function mutate(mutator, options) {
  const fixture = structuredClone(reusableEvidence(options));
  mutator(fixture);
  return fixture;
}
const pr = value => value.pullRequests[0];
const candidate = value => value.candidates[0];
const run = value => candidate(value).run;
const fallback = value => candidate(value).fallbackPullRequests[0];
const directPr = value => run(value).pull_requests[0];
const direct = { direct: true };
test('exact empty-association fallback and exact direct association permit reuse', () => {
  assert.deepEqual(decideMainE2eReuse(reusableEvidence()), {
    reuse: true,
    reason: 'exact_pr_evidence',
  });
  assert.deepEqual(decideMainE2eReuse(reusableEvidence({ direct: true })), {
    reuse: true,
    reason: 'exact_pr_evidence',
  });
});
const rejectionCases = [
  ['wrong event', value => (value.context.eventName = 'pull_request')],
  ['wrong ref', value => (value.context.ref = 'refs/heads/master')],
  ['wrong repository', value => (value.context.repository = 'attacker/interdomestik')],
  ['local head mismatch', value => (value.local.headSha = HEAD_SHA)],
  ['ambiguous merged PR', value => value.pullRequests.push(value.pullRequests[0])],
  ['missing merged PR', value => (value.pullRequests = [])],
  ['unmerged PR', value => (pr(value).merged_at = null)],
  ['wrong merge SHA', value => (pr(value).merge_commit_sha = HEAD_SHA)],
  ['wrong base repository', value => (pr(value).base.repo.full_name = 'other/repo')],
  ['wrong base ref', value => (pr(value).base.ref = 'develop')],
  ['fork head repository', value => (pr(value).head.repo.full_name = 'fork/repo')],
  ['tree mismatch', value => (value.headCommit.commit.tree.sha = MAIN_SHA)],
  ['wrong workflow path', value => (run(value).path = '.github/workflows/ci.yml')],
  ['wrong run event', value => (run(value).event = 'push')],
  ['wrong run head', value => (run(value).head_sha = MAIN_SHA)],
  ['wrong run repository', value => (run(value).repository.full_name = 'other/repo')],
  ['wrong run head repository', value => (run(value).head_repository.full_name = 'fork/repo')],
  ['failed run', value => (run(value).conclusion = 'failure')],
  ['malformed direct association', value => (run(value).pull_requests = null)],
  ['invalid start time', value => (run(value).run_started_at = 'not-a-date')],
  ['stale run', value => (run(value).run_started_at = '2026-08-12T15:59:59Z')],
  ['future run outside tolerance', value => (run(value).run_started_at = '2026-08-13T16:05:01Z')],
  ['missing runner', value => (candidate(value).jobs = [])],
  ['duplicate runner', value => candidate(value).jobs.push(candidate(value).jobs[0])],
  ['skipped runner', value => (candidate(value).jobs[0].conclusion = 'skipped')],
  ['incomplete runner', value => (candidate(value).jobs[0].status = 'in_progress')],
  ['fallback ambiguity', value => candidate(value).fallbackPullRequests.push(pr(value))],
  ['fallback PR mismatch', value => (fallback(value).number = 9999)],
  ['fallback ID mismatch', value => (fallback(value).id += 1)],
  ['fallback timestamp mismatch', value => (fallback(value).merged_at = '2026-08-13T15:27:40Z')],
  ['fallback ref mismatch', value => (fallback(value).head.ref = 'other-branch')],
  ['fallback head mismatch', value => (fallback(value).head.sha = MAIN_SHA)],
  [
    'fallback head repository mismatch',
    value => (fallback(value).head.repo.full_name = 'fork/repo'),
  ],
  [
    'fallback base repository mismatch',
    value => (fallback(value).base.repo.full_name = 'other/repo'),
  ],
  ['fallback base ref mismatch', value => (fallback(value).base.ref = 'develop')],
  ['fallback merged-state mismatch', value => (fallback(value).state = 'open')],
  ['fallback merge mismatch', value => (fallback(value).merge_commit_sha = HEAD_SHA)],
  ['checkout drift', value => (value.parity.checkoutHead = false)],
  ['missing parity evidence', value => (value.parity = {})],
  ['partial parity evidence', value => delete value.parity.databaseSubstrate],
  ['command chain drift', value => (value.parity.commandChain = false)],
  ['project drift', value => (value.parity.projectSuperset = false)],
  ['flag drift', value => (value.parity.sharedFlags = false)],
  ['database drift', value => (value.parity.databaseSubstrate = false)],
  ...strictSchemaRejectionCases,
  ['array PR timestamp', value => (pr(value).merged_at = ['2026-08-13T15:27:39Z'])],
  ['array run timestamp', value => (run(value).run_started_at = ['2026-08-13T14:50:50Z'])],
  ['zero PR ID', value => (pr(value).id = 0)],
  ['negative PR number', value => (pr(value).number = -1)],
  ['zero base repository ID', value => (pr(value).base.repo.id = 0)],
  ['zero head repository ID', value => (pr(value).head.repo.id = 0)],
  ['zero run ID', value => (run(value).id = 0)],
  ['negative runner ID', value => (candidate(value).jobs[0].id = -1)],
  ['zero run repository ID', value => (run(value).repository.id = 0)],
  ['zero run head repository ID', value => (run(value).head_repository.id = 0)],
  ['zero direct PR ID', value => (directPr(value).id = 0), direct],
  ['negative direct PR number', value => (directPr(value).number = -1), direct],
  ['zero direct base repository ID', value => (directPr(value).base.repo.id = 0), direct],
  ['zero direct head repository ID', value => (directPr(value).head.repo.id = 0), direct],
  ['zero fallback base repository ID', value => (fallback(value).base.repo.id = 0)],
  ['zero fallback head repository ID', value => (fallback(value).head.repo.id = 0)],
];
for (const [name, mutator, options] of rejectionCases) {
  test(`rejects ${name}`, () => {
    assert.deepEqual(decideMainE2eReuse(mutate(mutator, options)), reject);
  });
}
test('a non-empty direct mismatch cannot be repaired by fallback evidence', () => {
  const fixture = mutate(value => {
    value.candidates[0].run.pull_requests = [
      { ...directAssociation(), number: value.pullRequests[0].number + 1 },
    ];
    value.candidates[0].fallbackPullRequests = [structuredClone(value.pullRequests[0])];
  });
  assert.deepEqual(decideMainE2eReuse(fixture), reject);
});
for (const [name, mutateAssociation] of [
  ['id', value => (value.id += 1)],
  ['base ref', value => (value.base.ref = 'develop')],
  ['base repository', value => (value.base.repo.id += 1)],
  ['head ref', value => (value.head.ref = 'other-branch')],
  ['head SHA', value => (value.head.sha = MAIN_SHA)],
  ['head repository', value => (value.head.repo.id += 1)],
]) {
  test(`rejects direct association ${name} mismatch`, () => {
    const fixture = mutate(value => {
      const association = directAssociation();
      mutateAssociation(association);
      value.candidates[0].run.pull_requests = [association];
      value.candidates[0].fallbackPullRequests = [structuredClone(value.pullRequests[0])];
    });
    assert.deepEqual(decideMainE2eReuse(fixture), reject);
  });
}

test('normalization never accepts a hostile or incomplete true decision', () => {
  assert.deepEqual(normalizeReuseDecision({ reuse: true, reason: '$(touch /tmp/pwned)' }), reject);
  assert.deepEqual(normalizeReuseDecision({ reuse: 'true', reason: 'exact_pr_evidence' }), reject);
  assert.deepEqual(normalizeReuseDecision(null), reject);
  assert.deepEqual(
    normalizeReuseDecision({ reuse: true, reason: 'exact_pr_evidence', repository: REPOSITORY }),
    { reuse: true, reason: 'exact_pr_evidence' }
  );
});
