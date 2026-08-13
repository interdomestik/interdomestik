import assert from 'node:assert/strict';
import test from 'node:test';
import { decideMainE2eReuse, normalizeReuseDecision } from './main-e2e-reuse-core.mjs';
import {
  HEAD_SHA,
  MAIN_SHA,
  NOW_MS,
  REPOSITORY,
  directAssociation,
  reusableEvidence,
} from './main-e2e-reuse-fixture.mjs';
const reject = { reuse: false, reason: 'evidence_not_exact' };
function mutate(mutator, options) {
  const fixture = structuredClone(reusableEvidence(options));
  mutator(fixture);
  return fixture;
}
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
  ['unmerged PR', value => (value.pullRequests[0].merged_at = null)],
  ['wrong merge SHA', value => (value.pullRequests[0].merge_commit_sha = HEAD_SHA)],
  ['wrong base repository', value => (value.pullRequests[0].base.repo.full_name = 'other/repo')],
  ['wrong base ref', value => (value.pullRequests[0].base.ref = 'develop')],
  ['fork head repository', value => (value.pullRequests[0].head.repo.full_name = 'fork/repo')],
  ['tree mismatch', value => (value.headCommit.commit.tree.sha = MAIN_SHA)],
  ['wrong workflow path', value => (value.candidates[0].run.path = '.github/workflows/ci.yml')],
  ['wrong run event', value => (value.candidates[0].run.event = 'push')],
  ['wrong run head', value => (value.candidates[0].run.head_sha = MAIN_SHA)],
  ['wrong run repository', value => (value.candidates[0].run.repository.full_name = 'other/repo')],
  [
    'wrong run head repository',
    value => (value.candidates[0].run.head_repository.full_name = 'fork/repo'),
  ],
  ['failed run', value => (value.candidates[0].run.conclusion = 'failure')],
  ['malformed direct association', value => (value.candidates[0].run.pull_requests = null)],
  ['invalid start time', value => (value.candidates[0].run.run_started_at = 'not-a-date')],
  ['stale run', value => (value.candidates[0].run.run_started_at = '2026-08-12T15:59:59Z')],
  [
    'future run outside tolerance',
    value => (value.candidates[0].run.run_started_at = '2026-08-13T16:05:01Z'),
  ],
  ['missing runner', value => (value.candidates[0].jobs = [])],
  ['duplicate runner', value => value.candidates[0].jobs.push(value.candidates[0].jobs[0])],
  ['skipped runner', value => (value.candidates[0].jobs[0].conclusion = 'skipped')],
  ['incomplete runner', value => (value.candidates[0].jobs[0].status = 'in_progress')],
  [
    'fallback ambiguity',
    value => value.candidates[0].fallbackPullRequests.push(value.pullRequests[0]),
  ],
  ['fallback PR mismatch', value => (value.candidates[0].fallbackPullRequests[0].number = 9999)],
  ['fallback ID mismatch', value => (value.candidates[0].fallbackPullRequests[0].id += 1)],
  [
    'fallback timestamp mismatch',
    value => (value.candidates[0].fallbackPullRequests[0].merged_at = '2026-08-13T15:27:40Z'),
  ],
  [
    'fallback ref mismatch',
    value => (value.candidates[0].fallbackPullRequests[0].head.ref = 'other-branch'),
  ],
  [
    'fallback head mismatch',
    value => (value.candidates[0].fallbackPullRequests[0].head.sha = MAIN_SHA),
  ],
  [
    'fallback head repository mismatch',
    value => (value.candidates[0].fallbackPullRequests[0].head.repo.full_name = 'fork/repo'),
  ],
  [
    'fallback base repository mismatch',
    value => (value.candidates[0].fallbackPullRequests[0].base.repo.full_name = 'other/repo'),
  ],
  [
    'fallback base ref mismatch',
    value => (value.candidates[0].fallbackPullRequests[0].base.ref = 'develop'),
  ],
  [
    'fallback merged-state mismatch',
    value => (value.candidates[0].fallbackPullRequests[0].state = 'open'),
  ],
  [
    'fallback merge mismatch',
    value => (value.candidates[0].fallbackPullRequests[0].merge_commit_sha = HEAD_SHA),
  ],
  ['checkout drift', value => (value.parity.checkoutHead = false)],
  ['missing parity evidence', value => (value.parity = {})],
  ['partial parity evidence', value => delete value.parity.databaseSubstrate],
  ['project drift', value => (value.parity.projectSuperset = false)],
  ['flag drift', value => (value.parity.sharedFlags = false)],
  ['database drift', value => (value.parity.databaseSubstrate = false)],
];
for (const [name, mutator] of rejectionCases) {
  test(`rejects ${name}`, () => {
    assert.deepEqual(decideMainE2eReuse(mutate(mutator)), reject);
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
  assert.equal(NOW_MS > 0 && MAIN_SHA.length === 40, true);
});
