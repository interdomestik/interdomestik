import { ORIGIN, SHA40 } from './lean-current-authority-policy.mjs';

const TASK_ID = /^[A-Z0-9][A-Z0-9-]*$/u;
const CANONICAL_ORIGIN = `https://github.com/${ORIGIN}`;
const BRANCH =
  /^(?!HEAD$)(?!-)(?!.*(?:\.\.|\s|~|\^|:|\?|\*|\[|\\|\/\.|\.lock(?:\/|$)))[A-Za-z0-9._/-]+$/u;

function must(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, expected, label) {
  must(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  must(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()),
    `${label} keys are invalid`
  );
}

function contractsByName(operations, name) {
  return operations.filter(value => value?.operation === name);
}

export function expectedOperationFacts(operations) {
  const force = contractsByName(operations, 'bounded_force_with_lease_rebuild');
  const labels = contractsByName(operations, 'apply_full_gate_label');
  const cleanup = contractsByName(operations, 'task_owned_cleanup');
  return {
    branches: [...new Set(force.map(item => item.target.branch))].sort(),
    prs: [
      ...new Set(
        [...force, ...labels.filter(item => item.target.mode !== 'deferred-pr')].map(item =>
          String(item.target.prNumber)
        )
      ),
    ].sort(),
    deferredBranches: labels
      .filter(item => item.target.mode === 'deferred-pr')
      .map(item => item.target.branch)
      .sort(),
    cleanup: cleanup[0] ?? null,
    needsAuthority: cleanup.length > 0 || labels.length > 0,
  };
}

function validBranch(value) {
  return (
    typeof value === 'string' &&
    BRANCH.test(value) &&
    !value.startsWith('/') &&
    !value.endsWith('/') &&
    !value.endsWith('.') &&
    !value.includes('//') &&
    !value.includes('@{')
  );
}

function normalizePull(pull, { candidate = false } = {}) {
  exactKeys(
    pull,
    [
      'baseBranch',
      'branch',
      'fullGateEligible',
      'fullGateLabelPresent',
      'headSha',
      ...(candidate ? ['number'] : []),
      'origin',
      'state',
    ],
    candidate ? 'operation PR candidate' : 'operation pull request'
  );
  must(validBranch(pull.branch) && validBranch(pull.baseBranch), 'operation PR branch is invalid');
  must(SHA40.test(pull.headSha), 'operation PR head is invalid');
  must(pull.origin === CANONICAL_ORIGIN, 'operation PR origin is invalid');
  must(pull.state === 'OPEN', 'operation PR state is not open');
  must(
    typeof pull.fullGateLabelPresent === 'boolean' &&
      typeof pull.fullGateEligible === 'boolean' &&
      pull.fullGateEligible === !pull.fullGateLabelPresent,
    'operation PR full-gate state is invalid'
  );
  if (candidate) {
    must(Number.isSafeInteger(pull.number) && pull.number > 0, 'candidate PR number is invalid');
  }
  return { ...pull };
}

export function normalizeOperationFacts(input, operations) {
  if (input === null || input === undefined) return null;
  exactKeys(
    input,
    ['authority', 'pullRequestCandidates', 'pullRequests', 'remoteHeads', 'taskOwnedArtifacts'],
    'operation facts'
  );
  const expected = expectedOperationFacts(operations);
  exactKeys(input.remoteHeads, expected.branches, 'operation remote heads');
  const remoteHeads = Object.fromEntries(
    expected.branches.map(branch => {
      must(validBranch(branch), 'operation remote branch is invalid');
      must(SHA40.test(input.remoteHeads[branch]), 'operation remote head is invalid');
      return [branch, input.remoteHeads[branch]];
    })
  );
  exactKeys(input.pullRequests, expected.prs, 'operation pull requests');
  const pullRequests = Object.fromEntries(
    expected.prs.map(number => [number, normalizePull(input.pullRequests[number])])
  );
  exactKeys(input.pullRequestCandidates, expected.deferredBranches, 'operation PR candidates');
  const pullRequestCandidates = Object.fromEntries(
    expected.deferredBranches.map(branch => {
      const candidates = input.pullRequestCandidates[branch];
      must(
        Array.isArray(candidates) && candidates.length <= 2,
        'operation PR candidates are invalid'
      );
      return [branch, candidates.map(candidate => normalizePull(candidate, { candidate: true }))];
    })
  );
  let authority = null;
  if (expected.needsAuthority) {
    exactKeys(
      input.authority,
      ['activeSlice', 'approvedHeadSha', 'runtimeAuthorized', 'writerMapDigest'],
      'operation authority'
    );
    must(
      input.authority.activeSlice === null || TASK_ID.test(input.authority.activeSlice),
      'operation active slice is invalid'
    );
    must(
      typeof input.authority.runtimeAuthorized === 'boolean',
      'operation runtime fact is invalid'
    );
    must(
      input.authority.approvedHeadSha === null || SHA40.test(input.authority.approvedHeadSha),
      'operation approved head is invalid'
    );
    must(
      input.authority.writerMapDigest === null ||
        /^[0-9a-f]{64}$/u.test(input.authority.writerMapDigest),
      'operation writer-map digest is invalid'
    );
    authority = { ...input.authority };
  } else {
    must(input.authority === null, 'unexpected operation authority facts');
  }
  const artifactPaths = expected.cleanup?.target.artifactPaths ?? [];
  exactKeys(input.taskOwnedArtifacts, artifactPaths, 'task-owned artifacts');
  const taskOwnedArtifacts = Object.fromEntries(
    artifactPaths.map(path => {
      const artifact = input.taskOwnedArtifacts[path];
      exactKeys(artifact, ['exists', 'ownerTaskId', 'safeToDiscard'], 'task-owned artifact');
      must(typeof artifact.exists === 'boolean', 'task-owned artifact existence is invalid');
      must(
        typeof artifact.safeToDiscard === 'boolean',
        'task-owned artifact disposition is invalid'
      );
      must(
        artifact.ownerTaskId === null || TASK_ID.test(artifact.ownerTaskId),
        'task-owned artifact owner is invalid'
      );
      return [path, { ...artifact }];
    })
  );
  return { authority, pullRequestCandidates, pullRequests, remoteHeads, taskOwnedArtifacts };
}
