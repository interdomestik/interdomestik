import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from './slice-rehearse-core.mjs';
import {
  normalizeRoutineOperations,
  resolveOperationalContracts,
  verifyOperationAtExecution,
} from './slice-rehearse-operation-contracts.mjs';

const sha = value => value.repeat(40);
const origin = 'https://github.com/interdomestik/interdomestik';
const branch = 'codex/harness-v2';
const artifact = '/private/tmp/harness-v2-worktree';
const authority = (active = true, approved = active) => ({
  activeSlice: active ? 'HARNESS-V2' : null,
  approvedHeadSha: approved ? sha('b') : null,
  runtimeAuthorized: active,
  writerMapDigest: active ? sha256('writers') : null,
});
const pull = () => ({
  number: 1662,
  origin,
  baseBranch: 'main',
  branch,
  headSha: sha('b'),
  state: 'OPEN',
  fullGateLabelPresent: false,
  fullGateEligible: true,
});
const cleanup = {
  operation: 'task_owned_cleanup',
  target: { taskId: 'HARNESS-V2', artifactPaths: [artifact] },
  preconditions: { authorityInactive: true },
};
const label = {
  operation: 'apply_full_gate_label',
  target: {
    mode: 'deferred-pr',
    origin,
    baseBranch: 'main',
    branch,
    label: 'full-gate',
    taskId: 'HARNESS-V2',
  },
  preconditions: {
    uniquePullRequest: true,
    headEqualsBranchHead: true,
    resolverWriterIdentity: true,
    labelAbsent: true,
  },
};

function facts({ candidates = [], active = true, safe = true } = {}) {
  return {
    authority: authority(active, candidates.length > 0),
    pullRequests: {},
    pullRequestCandidates: candidates === null ? {} : { [branch]: candidates },
    remoteHeads: {},
    taskOwnedArtifacts: {
      [artifact]: {
        exists: true,
        ownerTaskId: safe ? 'HARNESS-V2' : null,
        safeToDiscard: safe,
      },
    },
  };
}

const repository = operationFacts => ({
  branch,
  headSha: sha('b'),
  writerMapDigest: sha256('writers'),
  operationFacts,
});

test('deferred label and cleanup resolve exactly and revalidate at execution', () => {
  const operations = normalizeRoutineOperations([label, cleanup]);
  const pre = resolveOperationalContracts(operations, repository(facts()));
  assert.deepEqual(pre.rejected, []);
  assert.ok(pre.granted.every(item => item.deferred));

  assert.throws(
    () => normalizeRoutineOperations([{ ...cleanup, deferred: false }]),
    /execution-only/u
  );

  const exact = facts({ candidates: [pull()] });
  const resolved = resolveOperationalContracts(operations, repository(exact));
  assert.deepEqual(resolved.rejected, []);
  const resolvedLabel = resolved.granted.find(item => item.operation === 'apply_full_gate_label');
  const labelFacts = { ...exact, taskOwnedArtifacts: {} };
  assert.equal(verifyOperationAtExecution(resolvedLabel, repository(labelFacts)).deferred, false);

  const deferredCleanup = resolved.granted.find(item => item.operation === 'task_owned_cleanup');
  const cleanupFacts = { ...exact, pullRequestCandidates: {} };
  assert.throws(
    () => verifyOperationAtExecution(deferredCleanup, repository(cleanupFacts)),
    /inactive authority/u
  );
  cleanupFacts.authority = authority(false);
  assert.equal(
    verifyOperationAtExecution(deferredCleanup, repository(cleanupFacts)).deferred,
    false
  );

  labelFacts.pullRequestCandidates[branch] = [];
  assert.throws(
    () => verifyOperationAtExecution(resolvedLabel, repository(labelFacts)),
    /no longer satisfied/u
  );
});
