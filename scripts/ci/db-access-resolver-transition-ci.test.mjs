import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test, { before } from 'node:test';
import yaml from 'js-yaml';
import { rootDir, tmp, git } from './db-access-required-git.mjs';

const base = '67358772ce0cb056f78be082362fb297bfab7b9d';
const guard = '3863df0354f2ba7e9051605ef753870515db5092';
const tree = '3161a77b393235ecd1c8311561503d614b31c380';
const successorBase = 'f696ec742ffbb108502f5c930aee907e6cea4402';
const successorGuard = '1219d276f1ab74451ec9fa1537125131a935f846';
const successorTree = '951ab3a44912e9927d55b8cd9c5cadb0e65587a0';
const workflow = yaml.load(fs.readFileSync(path.join(rootDir, '.github/workflows/ci.yml'), 'utf8'));
const script = workflow.jobs.audit.steps.find(step => step.id === 'protected_db_access').run;
const start = '# Exact first resolver transition:';
const from = script.indexOf(start);
const to = script.indexOf('tgz="$work/typescript.tgz"', from);
before(() => {
  assert.ok(from >= 0 && to > from && !script.includes(start, from + start.length));
});
const branch = script.slice(from, to);

function repository({
  source = true,
  reachable = true,
  baseCommit = base,
  sourceCommit = guard,
} = {}) {
  const root = tmp('resolver-transition-ci');
  git(root, 'init', '-q', '--bare');
  git(
    root,
    'fetch',
    '-q',
    '--no-write-fetch-head',
    `file://${rootDir}`,
    `${baseCommit}:refs/protected/main`
  );
  if (source)
    git(
      root,
      'fetch',
      '-q',
      '--no-write-fetch-head',
      `file://${rootDir}`,
      reachable ? `${sourceCommit}:refs/protected/authority` : sourceCommit
    );
  return root;
}
function select(
  root,
  {
    event = 'pull_request',
    defaultBranch = 'main',
    baseRef = 'main',
    anchor = base,
    body = branch,
  } = {}
) {
  const home = tmp('resolver-transition-home');
  return spawnSync(
    '/bin/bash',
    [
      '--noprofile',
      '--norc',
      '-c',
      [
        'set -euo pipefail',
        'fail() { printf "%s\\n" "$*" >&2; exit 1; }',
        'gd=(/usr/bin/git --git-dir="$1")',
        'EVENT_NAME="$2"; DEFAULT_BRANCH="$3"; PR_BASE_REF="$4"; protected="$5"',
        body,
        'printf "%s" "$protected"',
      ].join('\n'),
      'fixture',
      root,
      event,
      defaultBranch,
      baseRef,
      anchor,
    ],
    {
      env: {
        PATH: '/usr/bin:/bin',
        HOME: home,
        LC_ALL: 'C',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_NO_REPLACE_OBJECTS: '1',
      },
      encoding: 'utf8',
      timeout: 30000,
    }
  );
}

test('exact validated first main base selects only immutable reviewed G/tree', () => {
  const root = repository();
  assert.equal(git(rootDir, 'rev-parse', `${guard}^{tree}`), tree);
  const result = select(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, guard);
});

test('missing or unreachable transition source cannot fall back to old guard', () => {
  for (const [options, reason] of [
    [{ source: false }, /guard identity/u],
    [{ reachable: false }, /guard unreachable/u],
  ]) {
    const result = select(repository(options));
    assert.equal(result.status, 1);
    assert.match(result.stderr, reason);
    assert.equal(result.stdout, '');
  }
});

test('a wrong fixed source tree is rejected before any compiler or guard executes', () => {
  const result = select(repository(), { body: branch.replace(tree, '0'.repeat(40)) });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /guard identity/u);
});

test('push, other default/base branch and other validated epoch preserve original selection', () => {
  const root = repository({ source: false });
  for (const options of [
    { event: 'push' },
    { defaultBranch: 'master' },
    { baseRef: 'feature' },
    { anchor: '278e33ab0dd448547fa81d4b0ff122b4d69c901e' },
  ]) {
    const result = select(root, options);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, options.anchor ?? base);
  }
});

// Keep the historical transition contracts above; this successor is a separate fixed pairing.
test('the exact dependency successor base selects only its immutable reviewed G/tree', () => {
  const root = repository({ baseCommit: successorBase, sourceCommit: successorGuard });
  assert.equal(git(rootDir, 'rev-parse', `${successorGuard}^{tree}`), successorTree);
  const result = select(root, { anchor: successorBase });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, successorGuard);
});

test('the successor refuses missing, unreachable or wrong-tree source before execution', () => {
  for (const [options, reason] of [
    [{ source: false }, /guard identity/u],
    [{ reachable: false }, /guard unreachable/u],
  ]) {
    const result = select(
      repository({ baseCommit: successorBase, sourceCommit: successorGuard, ...options }),
      { anchor: successorBase }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, reason);
    assert.equal(result.stdout, '');
  }
  const result = select(repository({ baseCommit: successorBase, sourceCommit: successorGuard }), {
    anchor: successorBase,
    body: branch.replace(successorTree, '0'.repeat(40)),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /guard identity/u);
});

test('the successor preserves push, other-branch and unrelated-epoch selection', () => {
  const root = repository({ source: false, baseCommit: successorBase });
  for (const options of [
    { event: 'push' },
    { defaultBranch: 'master' },
    { baseRef: 'feature' },
    { anchor: '278e33ab0dd448547fa81d4b0ff122b4d69c901e' },
  ]) {
    const result = select(root, { anchor: successorBase, ...options });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, options.anchor ?? successorBase);
  }
});
