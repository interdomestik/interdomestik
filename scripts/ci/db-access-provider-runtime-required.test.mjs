import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { authenticateRuntimeContext } from './db-access-provider-runtime-required.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's8-runtime-identity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'git');
  const env = {
    PATH: '/usr/bin:/bin',
    GIT_AUTHOR_NAME: 'Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
  };
  const git = (args, input) =>
    execFileSync('/usr/bin/git', ['--git-dir', dir, ...args], {
      env,
      input,
      encoding: 'utf8',
    }).trim();
  execFileSync('/usr/bin/git', ['init', '--bare', '--quiet', dir], { env });
  const tree = git(['mktree'], '');
  const commit = (label, parents = []) =>
    git(['commit-tree', tree, ...parents.flatMap(parent => ['-p', parent]), '-m', label]);
  const base = commit('base'),
    head = commit('head', [base]),
    merge = commit('merge', [base, head]),
    source = commit('source', [base]);
  git(['update-ref', 'refs/protected/main', base]);
  git(['update-ref', 'refs/protected/reviewed-guard', source]);
  return {
    git,
    dir,
    tree,
    commit,
    context: {
      version: 1,
      repository: 'interdomestik/interdomestik',
      eventName: 'pull_request',
      baseCommit: base,
      headCommit: head,
      candidateCommit: merge,
      candidateTree: tree,
      sourceCommit: source,
      sourceTree: tree,
      protectedMain: base,
    },
  };
}

test('exact merge and separately pinned reachable producer authenticate', t => {
  const { dir, context } = fixture(t);
  assert.equal(typeof authenticateRuntimeContext(dir, context), 'function');
});
test('wrong repository refuses before any runtime execution', t => {
  const { dir, context } = fixture(t);
  assert.throws(
    () => authenticateRuntimeContext(dir, { ...context, repository: 'fork/private' }),
    /event identity/
  );
});
test('missing commit identity cannot be supplied by a successful receipt', t => {
  const { dir, context } = fixture(t);
  assert.throws(
    () =>
      authenticateRuntimeContext(dir, { ...context, headCommit: undefined, runtimeExecuted: true }),
    /commit\/tree identity/
  );
});
test('stale merge with different head refuses', t => {
  const { dir, context } = fixture(t);
  assert.throws(
    () => authenticateRuntimeContext(dir, { ...context, headCommit: context.baseCommit }),
    /merge event parents/
  );
});
test('wrong candidate tree refuses', t => {
  const { dir, context } = fixture(t);
  assert.throws(
    () => authenticateRuntimeContext(dir, { ...context, candidateTree: '0'.repeat(40) }),
    /wrong tree/
  );
});
test('unreachable producer commit refuses even with matching source tree', t => {
  const { dir, context, commit } = fixture(t);
  const orphan = commit('unreachable');
  assert.throws(
    () => authenticateRuntimeContext(dir, { ...context, sourceCommit: orphan }),
    /source unreachable/
  );
});
test('substituting protected-main identity refuses', t => {
  const { dir, context } = fixture(t);
  assert.throws(
    () => authenticateRuntimeContext(dir, { ...context, protectedMain: context.headCommit }),
    /protected main ref/
  );
});
test('push must bind candidate, head, and actual protected main', t => {
  const { git, dir, context } = fixture(t);
  git(['update-ref', 'refs/protected/main', context.headCommit]);
  const push = {
    ...context,
    eventName: 'push',
    candidateCommit: context.headCommit,
    protectedMain: context.headCommit,
  };
  assert.equal(typeof authenticateRuntimeContext(dir, push), 'function');
  assert.throws(
    () => authenticateRuntimeContext(dir, { ...push, candidateCommit: context.baseCommit }),
    /push event head/
  );
});
