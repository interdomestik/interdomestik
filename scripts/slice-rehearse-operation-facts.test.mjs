import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectOperationFacts,
  normalizeOperationFacts,
} from './slice-rehearse-operation-facts.mjs';
import { resolveOperationalContracts } from './slice-rehearse-operation-contracts.mjs';
import { sha256 } from './slice-rehearse-canonical.mjs';

const origin = 'https://github.com/interdomestik/interdomestik';
const headSha = 'b'.repeat(40);
const branch = 'codex/harness-v2';
const writerMapDigest = sha256('writers');

function deferredOperation() {
  return {
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
}

function pull(number = 1664, overrides = {}) {
  return {
    number,
    state: 'open',
    base: { ref: 'main' },
    head: {
      ref: branch,
      sha: headSha,
      repo: { full_name: 'interdomestik/interdomestik' },
    },
    labels: [],
    ...overrides,
  };
}

function collect({ pulls = [], authority } = {}) {
  const endpoints = [];
  const facts = collectOperationFacts({
    repository: '/repo',
    operations: [deferredOperation()],
    readGithub: endpoint => {
      endpoints.push(endpoint);
      return pulls;
    },
    readAuthority: () =>
      authority ?? {
        activeSlice: null,
        approvedHeadSha: null,
        runtimeAuthorized: false,
        writerMapDigest: null,
      },
  });
  return { endpoints, facts };
}

test('collects bounded pre-PR facts and preserves the exact deferred predicate', () => {
  const { endpoints, facts } = collect();
  assert.deepEqual(endpoints, [
    'repos/interdomestik/interdomestik/pulls?state=open&base=main&head=interdomestik:codex%2Fharness-v2&per_page=2',
  ]);
  const result = resolveOperationalContracts([deferredOperation()], {
    branch,
    headSha,
    writerMapDigest,
    operationFacts: facts,
  });
  assert.deepEqual(result.rejected, []);
  assert.equal(result.granted[0].deferred, true);
});

test('rejects malformed deferred labels before accessing label entries', () => {
  let labelsAccessed = false;
  const labels = new Proxy(
    {},
    {
      get() {
        labelsAccessed = true;
        throw new Error('malformed label inventory must not be traversed');
      },
    }
  );
  const { facts } = collect({ pulls: [pull(1664, { labels })] });
  assert.equal(facts, null);
  assert.equal(labelsAccessed, false);
});

test('resolves one exact active PR and rejects zero-active, multiple, stale, or labeled candidates', () => {
  const active = {
    activeSlice: 'HARNESS-V2',
    approvedHeadSha: headSha,
    runtimeAuthorized: true,
    writerMapDigest,
  };
  const one = collect({ pulls: [pull()], authority: active }).facts;
  const repository = { branch, headSha, writerMapDigest, operationFacts: one };
  assert.equal(
    resolveOperationalContracts([deferredOperation()], repository).granted[0].deferred,
    false
  );
  const wrongTask = collect({
    pulls: [pull()],
    authority: { ...active, activeSlice: 'OTHER-SLICE' },
  }).facts;
  assert.equal(
    resolveOperationalContracts([deferredOperation()], {
      ...repository,
      operationFacts: wrongTask,
    }).rejected[0].reason,
    'deferred-predicate-unresolved'
  );

  for (const pulls of [
    [],
    [pull(), pull(1665)],
    [pull(1664, { head: { ...pull().head, sha: 'c'.repeat(40) } })],
    [pull(1664, { labels: [{ name: 'full-gate' }] })],
  ]) {
    const operationFacts = collect({ pulls, authority: active }).facts;
    const result = resolveOperationalContracts([deferredOperation()], {
      ...repository,
      operationFacts,
    });
    assert.equal(result.granted.length, 0);
    assert.equal(result.rejected[0].reason, 'deferred-predicate-unresolved');
  }
});

test('normalization rejects unknown provider fields and cleanup distinguishes uninspectable paths', () => {
  const { facts } = collect();
  assert.throws(
    () => normalizeOperationFacts({ ...facts, token: 'secret' }, [deferredOperation()]),
    /keys are invalid/u
  );
  const cleanup = {
    operation: 'task_owned_cleanup',
    deferred: true,
    target: { taskId: 'HARNESS-V2', artifactPaths: ['/private/tmp/HARNESS-V2-user-wip'] },
    preconditions: { authorityInactive: true },
  };
  const cleanupFacts = collectOperationFacts({
    repository: '/repo',
    operations: [cleanup],
    readAuthority: () => ({
      activeSlice: 'HARNESS-V2',
      approvedHeadSha: null,
      runtimeAuthorized: true,
      writerMapDigest,
    }),
  });
  assert.equal(cleanupFacts.taskOwnedArtifacts[cleanup.target.artifactPaths[0]].ownerTaskId, null);
  const rehearsal = resolveOperationalContracts([cleanup], { operationFacts: cleanupFacts });
  assert.equal(rehearsal.granted.length, 0);
  assert.equal(rehearsal.rejected[0].reason, 'artifact-uninspectable');
});

test('authority reads inherit hardened Git settings and restore the caller environment', () => {
  const before = process.env.GIT_OPTIONAL_LOCKS;
  const { facts } = collect({
    authority: {
      activeSlice: null,
      approvedHeadSha: null,
      runtimeAuthorized: false,
      writerMapDigest: null,
    },
  });
  assert.ok(facts);
  assert.equal(process.env.GIT_OPTIONAL_LOCKS, before);
  const guarded = collectOperationFacts({
    repository: '/repo',
    operations: [deferredOperation()],
    readGithub: () => [],
    readAuthority: () => {
      assert.equal(process.env.GIT_OPTIONAL_LOCKS, '0');
      assert.equal(process.env.GIT_CONFIG_KEY_0, 'core.fsmonitor');
      return facts.authority;
    },
  });
  assert.ok(guarded);
});
