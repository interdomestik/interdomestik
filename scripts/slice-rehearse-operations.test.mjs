import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256, validateRehearsalManifest } from './slice-rehearse-core.mjs';
import {
  resolveOperationalContracts,
  verifyOperationAtExecution,
} from './slice-rehearse-operation-contracts.mjs';

const sha = value => value.repeat(40);
const origin = 'https://github.com/interdomestik/interdomestik';

function contracts() {
  return [
    'derived_capacity_rebind',
    {
      operation: 'bounded_force_with_lease_rebuild',
      target: {
        origin,
        baseBranch: 'main',
        branch: 'codex/harness-v2',
        prNumber: 1662,
        headSha: sha('b'),
      },
      preconditions: { leaseSha: sha('c') },
      postconditions: { prHeadSha: sha('b'), remoteHeadSha: sha('b') },
    },
    {
      operation: 'apply_full_gate_label',
      target: {
        origin,
        baseBranch: 'main',
        branch: 'codex/harness-v2',
        prNumber: 1662,
        headSha: sha('b'),
        label: 'full-gate',
        taskId: 'HARNESS-V2',
      },
      preconditions: { prHeadSha: sha('b'), labelAbsent: true },
    },
    {
      operation: 'task_owned_cleanup',
      target: { taskId: 'HARNESS-V2', artifactPaths: ['/private/tmp/harness-v2-worktree'] },
      preconditions: { authorityInactive: true },
    },
  ];
}

function manifest(routineOperations = contracts()) {
  return {
    schemaVersion: 1,
    sliceId: 'HARNESS-V2',
    tier: 3,
    baseSha: sha('a'),
    origin,
    writerPaths: ['scripts/slice-rehearse-core.mjs'],
    pathPlans: [
      {
        path: 'scripts/slice-rehearse-core.mjs',
        change: 'modify',
        category: 'source/scripts',
        maxBytesDelta: 8_000,
        maxLines: 300,
      },
    ],
    routineOperations,
    proof: {
      commands: ['node --test'],
      heavyLanes: [],
      fullGateRequired: false,
      workflowDigest: sha256('workflow'),
      substrateDigest: sha256('substrate'),
    },
    evidenceReceipts: [],
    topology: {
      closeoutMode: 'none',
      projectionPaths: [],
      repairAllocationId: null,
      repairPaths: [],
    },
  };
}

function pull(headSha = sha('c'), label = false) {
  return {
    origin,
    baseBranch: 'main',
    branch: 'codex/harness-v2',
    headSha,
    state: 'OPEN',
    fullGateLabelPresent: label,
    fullGateEligible: !label,
  };
}

function facts(overrides = {}) {
  return {
    authority: {
      activeSlice: 'HARNESS-V2',
      approvedHeadSha: sha('b'),
      runtimeAuthorized: true,
      writerMapDigest: sha256('writers'),
    },
    pullRequestCandidates: {},
    pullRequests: { 1662: pull() },
    remoteHeads: { 'codex/harness-v2': sha('c') },
    taskOwnedArtifacts: {
      '/private/tmp/harness-v2-worktree': {
        exists: true,
        ownerTaskId: 'HARNESS-V2',
        safeToDiscard: true,
      },
    },
    ...overrides,
  };
}

test('requires exact sensitive contracts bound to the rehearsal slice and origin', () => {
  for (const operation of [
    'bounded_force_with_lease_rebuild',
    'apply_full_gate_label',
    'task_owned_cleanup',
  ]) {
    assert.throws(() => validateRehearsalManifest(manifest([operation])), /exact contract/u);
  }
  const wrongTask = contracts();
  wrongTask[3].target.taskId = 'T117B-DATA';
  assert.throws(() => validateRehearsalManifest(manifest(wrongTask)), /operation task differs/u);
});

test('orders force old lease to new head before granting full-gate on the new head', () => {
  const operations = validateRehearsalManifest(manifest()).routineOperations;
  const repository = {
    branch: 'codex/harness-v2',
    headSha: sha('b'),
    writerMapDigest: sha256('writers'),
    operationFacts: facts(),
  };
  const result = resolveOperationalContracts(operations, repository);
  assert.deepEqual(result.rejected, []);
  assert.equal(
    result.granted.find(item => item.operation === 'apply_full_gate_label').target.headSha,
    sha('b')
  );

  const stale = contracts();
  stale[2].target.headSha = sha('c');
  stale[2].preconditions.prHeadSha = sha('c');
  const staleResult = resolveOperationalContracts(
    validateRehearsalManifest(manifest(stale)).routineOperations,
    repository
  );
  assert.ok(staleResult.rejected.some(item => item.reason === 'head-or-branch-mismatch'));

  const crossPull = contracts()[2];
  crossPull.target.prNumber = 1777;
  const crossResult = resolveOperationalContracts(
    validateRehearsalManifest(manifest([crossPull])).routineOperations,
    {
      ...repository,
      operationFacts: facts({
        pullRequests: {
          1777: { ...pull(sha('b')), branch: 'codex/other-slice' },
        },
        pullRequestCandidates: {},
        remoteHeads: {},
        taskOwnedArtifacts: {},
      }),
    }
  );
  assert.ok(crossResult.rejected.some(item => item.reason === 'head-or-branch-mismatch'));
});

test('rejects wrong lease, closed or labeled PR, malformed facts, and unsafe cleanup', () => {
  const operations = validateRehearsalManifest(manifest()).routineOperations;
  const repository = {
    branch: 'codex/harness-v2',
    headSha: sha('b'),
    writerMapDigest: sha256('writers'),
    operationFacts: facts(),
  };
  const cases = [
    [facts({ remoteHeads: { 'codex/harness-v2': sha('d') } }), 'lease-mismatch'],
    [facts({ pullRequests: { 1662: { ...pull(), state: 'CLOSED' } } }), 'remote-head-unavailable'],
    [facts({ pullRequests: { 1662: pull(sha('c'), true) } }), 'full-gate-label-not-eligible'],
    [
      facts({
        authority: {
          activeSlice: null,
          approvedHeadSha: null,
          runtimeAuthorized: false,
          writerMapDigest: null,
        },
        taskOwnedArtifacts: {
          '/private/tmp/harness-v2-worktree': {
            exists: true,
            ownerTaskId: null,
            safeToDiscard: false,
          },
        },
      }),
      'artifact-discard-unverified',
    ],
  ];
  for (const [operationFacts, reason] of cases) {
    const result = resolveOperationalContracts(operations, { ...repository, operationFacts });
    assert.ok(result.rejected.some(item => item.reason === reason));
  }
  const extra = facts();
  extra.secret = 'not allowed';
  assert.equal(
    resolveOperationalContracts(operations, { ...repository, operationFacts: extra }).facts,
    null
  );
});
