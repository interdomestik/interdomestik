import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  formatReuseDecision,
  inspectRepositoryParity,
  resolveMainE2eReuse,
} from './main-e2e-reuse.mjs';
import { MAIN_SHA, NOW_MS, REPOSITORY, reusableEvidence } from './main-e2e-reuse-fixture.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const paths = {
  ci: path.join(root, '.github/workflows/ci.yml'),
  pr: path.join(root, '.github/workflows/e2e-pr.yml'),
  lanes: path.join(root, 'scripts/run-e2e-lane.mjs'),
};
function sources() {
  return {
    ciWorkflow: readFileSync(paths.ci, 'utf8'),
    prWorkflow: readFileSync(paths.pr, 'utf8'),
    laneSource: readFileSync(paths.lanes, 'utf8'),
  };
}
function environment(overrides = {}) {
  return {
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_SHA: MAIN_SHA,
    GITHUB_TOKEN: 'test-token',
    ...overrides,
  };
}
function dependencies(overrides = {}) {
  const fixture = reusableEvidence();
  const { pullRequests, headCommit, candidates } = fixture;
  return {
    git: value => (value === 'HEAD' ? MAIN_SHA : fixture.local.treeSha),
    readFile: value => readFileSync(path.join(root, value), 'utf8'),
    collectEvidence: async () => ({ pullRequests, headCommit, candidates }),
    nowMs: NOW_MS,
    ...overrides,
  };
}
test('repository parity recognizes exact PR-head checkout and strict project superset', () => {
  assert.deepEqual(inspectRepositoryParity(sources()), {
    checkoutHead: true,
    projectSuperset: true,
    sharedFlags: true,
    databaseSubstrate: true,
  });
});
test('repository parity rejects checkout trigger, project, flag, and database drift', () => {
  const current = sources();
  const checkoutOnlySha = {
    ...current,
    prWorkflow: current.prWorkflow.replace(
      'ref: ${{ github.event.pull_request.head.sha || github.sha }}',
      'ref: ${{ github.sha }}'
    ),
  };
  assert.equal(inspectRepositoryParity(checkoutOnlySha).checkoutHead, false);
  const reorderedCheckout = {
    ...current,
    prWorkflow: current.prWorkflow.replace(
      'ref: ${{ github.event.pull_request.head.sha || github.sha }}',
      'ref: ${{ github.sha || github.event.pull_request.head.sha }}'
    ),
  };
  assert.equal(inspectRepositoryParity(reorderedCheckout).checkoutHead, false);
  const addedTrigger = {
    ...current,
    prWorkflow: current.prWorkflow.replace('on:\n  pull_request:', 'on:\n  push:\n  pull_request:'),
  };
  assert.equal(inspectRepositoryParity(addedTrigger).checkoutHead, false);
  const missingMainProject = {
    ...current,
    laneSource: current.laneSource.replace(
      'pr: gateLane([ksSq, mkContract, mkMk], true)',
      'pr: gateLane([ksSq, mkContract], true)'
    ),
  };
  assert.equal(inspectRepositoryParity(missingMainProject).projectSuperset, false);
  const flagDrift = {
    ...current,
    laneSource: current.laneSource.replace(
      'pr: gateLane([ksSq, mkContract, mkMk], true)',
      'pr: gateLane([ksSq, mkContract, mkMk], false)'
    ),
  };
  assert.equal(inspectRepositoryParity(flagDrift).sharedFlags, false);
  const databaseDrift = {
    ...current,
    prWorkflow: current.prWorkflow.replace(
      '127.0.0.1:5432/interdomestik_test',
      '127.0.0.1:54322/postgres'
    ),
  };
  assert.equal(inspectRepositoryParity(databaseDrift).databaseSubstrate, false);
  const serviceDrift = {
    ...current,
    prWorkflow: current.prWorkflow.replace('image: postgres:16', 'image: postgres:17'),
  };
  assert.equal(inspectRepositoryParity(serviceDrift).databaseSubstrate, false);
});
test('CLI resolver emits true only for normalized exact evidence', async () => {
  const decision = await resolveMainE2eReuse(environment(), dependencies());
  assert.deepEqual(decision, { reuse: true, reason: 'exact_pr_evidence' });
  assert.equal(formatReuseDecision(decision), 'reuse=true\nreason=exact_pr_evidence\n');
});
test('CLI resolver fails closed before GitHub access for an ineligible context', async () => {
  let calls = 0;
  const decision = await resolveMainE2eReuse(
    environment({ GITHUB_REF: 'refs/heads/master' }),
    dependencies({
      collectEvidence: async () => {
        calls += 1;
        throw new Error('must not run');
      },
    })
  );
  assert.deepEqual(decision, { reuse: false, reason: 'evidence_not_exact' });
  assert.equal(calls, 0);
});
test('CLI resolver converts GitHub, schema, and local failures to one safe decision', async () => {
  const fail = () => {
    throw new Error('token=secret body=secret');
  };
  for (const overrides of [{ collectEvidence: fail }, { git: fail }, { readFile: fail }]) {
    assert.deepEqual(await resolveMainE2eReuse(environment(), dependencies(overrides)), {
      reuse: false,
      reason: 'evidence_not_exact',
    });
  }
});
test('direct CLI invocation prints only the safe normalized decision', () => {
  const result = spawnSync(process.execPath, ['scripts/ci/main-e2e-reuse.mjs'], {
    cwd: root,
    env: { ...process.env, ...environment({ GITHUB_EVENT_NAME: 'pull_request' }) },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'reuse=false\nreason=evidence_not_exact\n');
  assert.equal(result.stderr, '');
});
