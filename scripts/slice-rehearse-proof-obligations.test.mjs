import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveryContract } from './github-pr-governance-report.mjs';
import {
  deriveProofObligationGraph,
  invalidatedProofNodes,
  evaluateFinalHeadReadiness,
  currentProofInputsMatch,
} from './slice-rehearse-proof-obligations.mjs';
import { collect, proofInputs } from './slice-rehearse-github-evidence-fixtures.mjs';
import { runHeavyProofExecution, planInvalidatedProofs } from './slice-rehearse-proof-plan.mjs';
import { canonicalJson, sha256 } from './slice-rehearse-canonical.mjs';

const contract = readDeliveryContract();
const B = '1'.repeat(40),
  H = '2'.repeat(40),
  T = '3'.repeat(40),
  TREE = '4'.repeat(40);
function snapshot() {
  return {
    expected: { base: B, head: H, testedMerge: T },
    pull: { state: 'open', baseSha: B, headSha: H },
    commits: {
      [B]: { tree: B, parents: [] },
      [H]: { tree: TREE, parents: [B] },
      [T]: { tree: TREE, parents: [B, H] },
    },
    checks: contract.deliveryPrerequisites
      .filter(spec => spec.classification === 'generator' && spec.requirement === 'required')
      .map(spec => ({
        context: spec.context,
        appId: spec.appId,
        headSha: H,
        runId: 1,
        runAttempt: 1,
        status: 'completed',
        conclusion: 'success',
        annotations: [],
      })),
    feedback: {
      headSha: H,
      disposedReviewIds: [],
      pagination: Object.fromEntries(
        ['checks', 'annotations', 'reviews', 'issueComments', 'reviewComments', 'threads'].map(
          key => [key, true]
        )
      ),
      unresolvedThreads: [],
      pendingReviewers: [],
      reviews: [],
      issueComments: [],
      reviewComments: [],
    },
    validationSurface: { shouldRun: true, reason: 'runtime_sensitive_surface' },
  };
}

test('proof graph derives all existing obligations and preserves independent finalizer and health edges', () => {
  const graph = deriveProofObligationGraph(contract);
  const nodes = new Map(graph.map(node => [node.id, node]));
  assert.deepEqual(
    nodes.get('pr-finalizer').dependencies,
    contract.finalizerLeafPrerequisites.map(spec => spec.context).sort()
  );
  for (const spec of contract.deliveryPrerequisites) {
    assert.equal(nodes.get(spec.context).appId, spec.appId);
    assert.ok(nodes.get('delivery-gate').dependencies.includes(spec.context));
  }
  assert.deepEqual(nodes.get('protected-main-health').dependencies, ['delivery-gate']);
  const invalid = invalidatedProofNodes(graph, ['CodeQL']);
  for (const id of [
    'CodeQL',
    'final-head',
    'pr-e2e',
    'e2e',
    'pr-finalizer',
    'delivery-gate',
    'protected-main-health',
  ])
    assert.ok(invalid.includes(id));
  assert.equal(invalidatedProofNodes(graph, ['unknown-dependency']).length, graph.length);
});

test('missing required edges, wrong app identities and cycles reject', () => {
  const altered = structuredClone(contract);
  altered.finalizerLeafPrerequisites[0].appId += 1;
  assert.throws(() => deriveProofObligationGraph(altered), /required proof edge/u);
  for (const nodes of [
    [{ id: 'a', dependencies: ['missing'] }],
    [
      { id: 'a', dependencies: ['b'] },
      { id: 'b', dependencies: ['a'] },
    ],
  ])
    assert.throws(() => invalidatedProofNodes(nodes, []), /unknown|cyclic/u);
});

test('final head follows finding-producing review without depending on its future heavy proof', () => {
  const ready = evaluateFinalHeadReadiness(contract, snapshot());
  assert.deepEqual([ready.baseSha, ready.headSha, ready.treeSha], [B, H, TREE]);
  assert.match(ready.reviewSha256, /^[a-f0-9]{64}$/u);
  for (const change of [
    value => value.checks.pop(),
    value => {
      value.checks[0].appId += 1;
    },
    value => {
      value.checks[0].headSha = B;
    },
    value => value.checks.push({ ...value.checks[0], runId: 2, conclusion: 'failure' }),
    value => {
      delete value.feedback.pagination.threads;
    },
    value => value.feedback.pendingReviewers.push('required-reviewer'),
    value =>
      value.feedback.reviewComments.push({
        commitId: H,
        author: 'openai-codex',
        body: 'P1: unsafe',
        createdAt: '2026-09-05T00:00:00Z',
      }),
    value => {
      value.pull.headSha = B;
    },
  ]) {
    const input = snapshot();
    change(input);
    assert.throws(() => evaluateFinalHeadReadiness(contract, input));
  }
});

test('immutable historical inputs do not establish current eligibility after material or external drift', () => {
  const before = proofInputs();
  assert.equal(currentProofInputsMatch(before, structuredClone(before)), true);
  assert.equal(currentProofInputsMatch(before, undefined), false);
  for (const key of Object.keys(before).filter(key => key !== 'externalSources')) {
    const current = structuredClone(before);
    current[key] = 'e'.repeat(before[key].length);
    assert.equal(currentProofInputsMatch(before, current), false, key);
  }
  const sources = {
    ...before,
    externalSources: [
      {
        sourceId: 'advisory-feed',
        identitySha256: 'a'.repeat(64),
        expiresAt: '2026-09-06T00:00:00Z',
      },
    ],
  };
  assert.equal(currentProofInputsMatch(sources, sources, Date.parse('2026-09-05T00:00:00Z')), true);
  assert.equal(
    currentProofInputsMatch(sources, sources, Date.parse('2026-09-07T00:00:00Z')),
    false
  );
  let providerReads = 0;
  assert.deepEqual(
    collect({
      previousProofInputs: undefined,
      currentProofInputs: undefined,
      readGithub: () => {
        providerReads++;
        return {};
      },
      readGitBytes: () => {
        providerReads++;
        return Buffer.alloc(0);
      },
    }),
    {}
  );
  assert.equal(providerReads, 0, 'missing trusted inputs deny reuse before evidence reads');
  assert.deepEqual(
    collect({ currentProofInputs: { ...before, requiredContextsAppsSha256: 'f'.repeat(64) } }),
    {}
  );
});

test('proof executor holds without current final-head review verification before any lease or effect', () => {
  const execution = {
    evidenceKey: 'a'.repeat(64),
    lane: 'pr-e2e',
    runId: 'proof-no-review',
    startedAt: new Date().toISOString(),
  };
  const report = {
    schemaVersion: 1,
    sliceId: 'PROOF-REVIEW',
    repository: { headSha: H, treeSha: TREE },
    authorityStops: [],
    evidence: {
      executionPlan: { run: [{ lane: execution.lane, evidenceKey: execution.evidenceKey }] },
    },
    reportSha256: null,
  };
  report.reportSha256 = sha256(canonicalJson(report));
  assert.throws(
    () =>
      runHeavyProofExecution({
        execution,
        report,
        verifyCandidate: () => true,
        verifyProofHost: () => true,
        acquireLease: () => assert.fail('no lease'),
        execute: () => assert.fail('no proof'),
      }),
    /final-head review evidence/u
  );
});

test('planner cannot omit its required executor lane or reuse without current input evidence', () => {
  assert.throws(
    () => planInvalidatedProofs({ requiredLanes: ['CodeQL'], decisions: [], expectedByLane: {} }),
    /required PR E2E/u
  );
  const identity = {
    headSha: H,
    treeSha: TREE,
    commandDigest: 'a'.repeat(64),
    workflowDigest: 'b'.repeat(64),
    substrateDigest: 'c'.repeat(64),
    writerMapDigest: 'd'.repeat(64),
  };
  const plan = planInvalidatedProofs({
    requiredLanes: ['pr-e2e'],
    decisions: [],
    expectedByLane: { 'pr-e2e': identity },
  });
  const input = { ...proofInputs(), headSha: H, treeSha: TREE };
  const params = {
    requiredLanes: ['pr-e2e'],
    expectedByLane: { 'pr-e2e': identity },
    decisions: [
      {
        lane: 'pr-e2e',
        key: plan.run[0].evidenceKey,
        reusable: true,
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    ],
  };
  assert.deepEqual(planInvalidatedProofs(params), plan);
  assert.deepEqual(
    planInvalidatedProofs({
      ...params,
      previousInputsByLane: { 'pr-e2e': input },
      currentInputsByLane: { 'pr-e2e': input },
      changedNodes: ['CodeQL'],
    }),
    plan
  );
});
