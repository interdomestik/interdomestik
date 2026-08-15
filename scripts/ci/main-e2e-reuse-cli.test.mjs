import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
import { commandChainDrifts } from './main-e2e-reuse-fixture.mjs';
import { readLocalGitObjectId } from './main-e2e-reuse-github.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const E2E_TREE = '99576782ad52f58c30316f5983df8ec654ba7ad1';
const SAFE = { reuse: false, reason: 'evidence_not_exact' };
const fail = () => {
  throw new Error('token=secret body=secret');
};
const keyPairs =
  'ciWorkflow=.github/workflows/ci.yml|prWorkflow=.github/workflows/e2e-pr.yml|laneSource=scripts/run-e2e-lane.mjs|playwrightConfig=apps/web/playwright.config.ts|packageJson=package.json';
const sourceKeys = Object.fromEntries(keyPairs.split('|').map(pair => pair.split('=').reverse()));
const read = file => readFileSync(path.join(root, file), 'utf8');
const sources = () => ({
  ...Object.fromEntries(Object.entries(sourceKeys).map(([file, key]) => [key, read(file)])),
  e2eTreeSha: E2E_TREE,
});
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
    git: value =>
      ({ HEAD: MAIN_SHA, 'HEAD^{tree}': fixture.local.treeSha, 'HEAD:apps/web/e2e': E2E_TREE })[
        value
      ],
    readFile: read,
    collectEvidence: async () => ({ pullRequests, headCommit, candidates }),
    nowMs: NOW_MS,
    ...overrides,
  };
}
test('repository parity recognizes exact PR-head checkout and strict project superset', () => {
  const current = sources();
  const laneDigest = createHash('sha256').update(current.laneSource).digest('hex');
  assert.equal(laneDigest, 'ff019f739b4ae106650a0dff94527154e9579468d0ea2d5a5eecff7c2f715b64');
  assert.deepEqual(inspectRepositoryParity(current), {
    checkoutHead: true,
    projectSuperset: true,
    sharedFlags: true,
    databaseSubstrate: true,
    commandChain: true,
  });
});
test('parity drift always resolves to a fail-closed reuse decision', async () => {
  const current = sources();
  const checkout = 'ref: ${{ github.event.pull_request.head.sha || github.sha }}';
  const reorderedCheckout = 'ref: ${{ github.sha || github.event.pull_request.head.sha }}';
  const prLane = 'pr: gateLane([ksSq, mkContract], true)';
  const gateScript = '"e2e:gate": "node scripts/run-e2e-lane.mjs gate"';
  const prGateScript = '"e2e:gate:pr": "node scripts/run-e2e-lane.mjs pr"';
  const database = '127.0.0.1:5432/interdomestik_test';
  const helperDrifts = commandChainDrifts.map(parts => ['commandChain', 'laneSource', ...parts]);
  const drifts = [
    ['checkoutHead', 'prWorkflow', checkout, 'ref: ${{ github.sha }}'],
    ['checkoutHead', 'prWorkflow', checkout, reorderedCheckout],
    ['checkoutHead', 'prWorkflow', 'on:\n  pull_request:', 'on:\n  push:\n  pull_request:'],
    ['projectSuperset', 'laneSource', prLane, 'pr: gateLane([ksSq, mkContract, mkMk], true)'],
    ['sharedFlags', 'laneSource', prLane, 'pr: gateLane([ksSq, mkContract], false)'],
    ['commandChain', 'playwrightConfig', 'gate-mk-contract', 'gate-mk-contract-drift'],
    ['databaseSubstrate', 'prWorkflow', database, '127.0.0.1:54322/postgres'],
    ['databaseSubstrate', 'prWorkflow', 'image: postgres:16', 'image: postgres:17'],
    ['commandChain', 'packageJson', gateScript, '"e2e:gate": "true"'],
    ['commandChain', 'packageJson', prGateScript, '"e2e:gate:pr": "true"'],
    ...helperDrifts,
    ['commandChain', 'laneSource', current.laneSource, `${current.laneSource}\n`],
  ];
  for (const [predicate, key, before, after] of drifts) {
    const mutation = { ...current, [key]: current[key].replace(before, after) };
    assert.notEqual(mutation[key], current[key], `${predicate} mutation did not apply`);
    assert.equal(inspectRepositoryParity(mutation)[predicate], false, predicate);
    const readFile = value => mutation[sourceKeys[value]];
    assert.deepEqual(await resolveMainE2eReuse(environment(), dependencies({ readFile })), SAFE);
  }
});
test('CLI resolver emits true only for normalized exact evidence', async () => {
  const decision = await resolveMainE2eReuse(environment(), dependencies());
  assert.deepEqual(decision, { reuse: true, reason: 'exact_pr_evidence' });
  assert.equal(formatReuseDecision(decision), 'reuse=true\nreason=exact_pr_evidence\n');
});
test('CLI resolver fails closed before GitHub access for an ineligible context', async () => {
  const decision = await resolveMainE2eReuse(
    environment({ GITHUB_REF: 'refs/heads/master' }),
    dependencies({ collectEvidence: fail })
  );
  assert.deepEqual(decision, SAFE);
});
test('CLI resolver converts GitHub, schema, and local failures to one safe decision', async () => {
  const git = dependencies().git;
  for (const overrides of [
    { collectEvidence: fail },
    { git: fail },
    { readFile: fail },
    { git: value => (value === 'HEAD:apps/web/e2e' ? '0'.repeat(40) : git(value)) },
    { git: value => (value === 'HEAD:apps/web/e2e' ? fail() : git(value)) },
  ]) {
    assert.deepEqual(await resolveMainE2eReuse(environment(), dependencies(overrides)), SAFE);
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
test('default git lookup ignores a writable PATH executable', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'ci01-path-'));
  const [fakeGit, marker] = ['git', 'executed'].map(file => path.join(directory, file));
  const originalPath = process.env.PATH;
  try {
    writeFileSync(fakeGit, '#!/bin/sh\n: > "$CI01_MARKER"\nprintf "%s\\n" "$GITHUB_SHA"\n');
    chmodSync(fakeGit, 0o755);
    process.env.PATH = directory;
    process.env.CI01_MARKER = marker;
    assert.match(readLocalGitObjectId(root, 'HEAD'), /^[0-9a-f]{40}$/u);
    assert.equal(existsSync(marker), false);
  } finally {
    process.env.PATH = originalPath;
    delete process.env.CI01_MARKER;
    rmSync(directory, { force: true, recursive: true });
  }
});
