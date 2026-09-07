import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import * as entrypoint from './slice-rehearse.mjs';
import * as factsModule from './slice-rehearse-git-facts.mjs';
import {
  validateRehearsalBootstrap,
  readLocalAnchor,
  assertLocalAnchor,
} from './slice-rehearse-bootstrap.mjs';

import { ENV, git, identity, fixture } from './slice-rehearse-bootstrap-fixtures.mjs';

test('validates a separate immutable policy checkout without importing its executable closure', async t => {
  const f = fixture(t);
  const before = git(f.policyRoot, 'status', '--porcelain=v1');
  const result = validateRehearsalBootstrap(f.bootstrap, f.targetRoot);
  assert.equal(result.policyRoot, realpathSync(f.policyRoot));
  assert.deepEqual(result.target, f.bootstrap.target);
  assert.equal(git(f.policyRoot, 'status', '--porcelain=v1'), before);
});

test('rejects moving, abbreviated and unresolved pins before policy or collector execution', async t => {
  const f = fixture(t);
  for (const pin of ['main', 'HEAD', f.bootstrap.policy.commitSha.slice(0, 12), 'f'.repeat(40)]) {
    const calls = [];
    const errors = [];
    const code = entrypoint.runSliceRehearsal({
      cwd: f.targetRoot,
      argv: ['--manifest', 'missing.json'],
      trustedBootstrap: { ...f.bootstrap, policy: { ...f.bootstrap.policy, commitSha: pin } },
      stderr: value => errors.push(value),
      readProtectedMain: () => calls.push('protected-main'),
      collectFacts: () => calls.push('facts'),
      collectOperations: () => calls.push('operations'),
      collectVerifiedEvidence: () => calls.push('proof'),
      evaluate: () => calls.push('evaluate'),
    });
    assert.equal(code, 1);
    assert.match(errors.join(''), /bootstrap.*pin/iu);
    assert.deepEqual(calls, []);
  }
});

test('binds the exact target checkout even when another worktree has the same HEAD', async t => {
  const f = fixture(t);
  const other = join(f.root, 'other-worktree');
  git(f.targetRoot, 'worktree', 'add', '-q', '--detach', other, 'HEAD');
  assert.throws(() => validateRehearsalBootstrap(f.bootstrap, other), /target.*identity/iu);
  for (const key of ['root', 'gitDir', 'commonDir', 'headSha', 'treeSha', 'branch', 'origin']) {
    const target = { ...f.bootstrap.target, [key]: `${f.bootstrap.target[key]}-wrong` };
    assert.throws(
      () => validateRehearsalBootstrap({ ...f.bootstrap, target }, f.targetRoot),
      /target.*identity/iu
    );
  }
});

test('never falls back to candidate policy or accepts a shared policy Git store', async t => {
  const f = fixture(t);
  assert.throws(
    () => validateRehearsalBootstrap({ target: f.bootstrap.target }, f.targetRoot),
    /policy/iu
  );
  const candidatePolicy = { root: f.bootstrap.target.root, commitSha: f.bootstrap.target.headSha };
  assert.throws(
    () => validateRehearsalBootstrap({ ...f.bootstrap, policy: candidatePolicy }, f.targetRoot),
    /separate/iu
  );
  const shared = join(f.root, 'shared-policy');
  git(f.targetRoot, 'worktree', 'add', '-q', '--detach', shared, 'HEAD');
  assert.throws(
    () =>
      validateRehearsalBootstrap(
        { ...f.bootstrap, policy: { ...candidatePolicy, root: realpathSync(shared) } },
        f.targetRoot
      ),
    /separate/iu
  );
});

test('checks dependency bytes despite hidden index flags, including executable mode and symlinks', async t => {
  for (const mode of [
    'ordinary',
    '--assume-unchanged',
    '--skip-worktree',
    'executable',
    'symlink',
  ]) {
    await t.test(mode, t => {
      const f = fixture(t);
      const file = join(f.policyRoot, 'scripts/dependency.mjs');
      if (mode.startsWith('--')) git(f.policyRoot, 'update-index', mode, 'scripts/dependency.mjs');
      if (mode === 'executable') chmodSync(file, 0o755);
      else if (mode === 'symlink') {
        const outside = join(f.root, 'dependency.mjs');
        writeFileSync(outside, readFileSync(file));
        rmSync(file);
        symlinkSync(outside, file);
      } else writeFileSync(file, 'throw new Error("changed dependency executed");\n');
      assert.throws(
        () => validateRehearsalBootstrap(f.bootstrap, f.targetRoot),
        /policy.*(changed|regular|hidden)/iu
      );
    });
  }
});

test('rejects ignored or ordinary untracked policy dependencies and a symlinked root', async t => {
  for (const file of ['ignored.mjs', 'scripts/new-dependency.mjs']) {
    await t.test(file, t => {
      const f = fixture(t);
      writeFileSync(join(f.policyRoot, file), 'throw new Error("untracked executed");\n');
      assert.throws(
        () => validateRehearsalBootstrap(f.bootstrap, f.targetRoot),
        /policy.*untracked/iu
      );
    });
  }
  const f = fixture(t);
  const alias = join(f.root, 'policy-alias');
  symlinkSync(f.policyRoot, alias);
  assert.throws(
    () =>
      validateRehearsalBootstrap(
        { ...f.bootstrap, policy: { ...f.bootstrap.policy, root: alias } },
        f.targetRoot
      ),
    /policy.*canonical/iu
  );
});

test('rejects intent-to-add policy files absent from the approved commit', async t => {
  const f = fixture(t);
  writeFileSync(join(f.policyRoot, 'extra.txt'), 'unapproved bytes\n');
  git(f.policyRoot, 'add', '-N', 'extra.txt');
  assert.equal(git(f.policyRoot, 'ls-files', '--others'), '');
  assert.throws(
    () => validateRehearsalBootstrap(f.bootstrap, f.targetRoot),
    /policy index changed/iu
  );
});

test('loads policy dependencies from the pinned policy checkout only after validation', t => {
  const f = fixture(t);
  const errors = [];
  assert.equal(
    entrypoint.runSliceRehearsal({
      cwd: f.targetRoot,
      argv: ['--manifest', 'missing.json'],
      trustedBootstrap: f.bootstrap,
      stderr: value => errors.push(value),
    }),
    1
  );
  assert.match(errors.join(''), /pinned policy dependency loaded/u);
});

test('strict caller re-admits each invocation and never loads policy after rejected admission', t => {
  const f = fixture(t),
    errors = [];
  const request = { cwd: f.targetRoot, manifestPath: 'missing.json' };
  const admission = {
    ...f.bootstrap,
    policy: { ...f.bootstrap.policy, treeSha: git(f.policyRoot, 'rev-parse', 'HEAD^{tree}') },
  };
  let calls = 0;
  const host = {
    stderr: text => errors.push(text),
    admit: observed => {
      assert.deepEqual(observed, request);
      assert.equal(Object.isFrozen(observed), true);
      calls++;
      if (calls > 1) throw new Error('host admission revoked');
      return admission;
    },
  };
  for (const pattern of [/pinned policy dependency loaded/u, /host admission revoked/u]) {
    errors.length = 0;
    assert.equal(entrypoint.runTrustedSliceRehearsal(request, host), 1);
    assert.match(errors.join(''), pattern);
  }
  assert.equal(calls, 2);
  for (const override of [{ evaluate() {} }, { trustedBootstrap: admission }, { argv: [] }]) {
    errors.length = 0;
    assert.equal(entrypoint.runTrustedSliceRehearsal({ ...request, ...override }, host), 1);
    assert.match(errors.join(''), /strict request/u);
  }
  assert.equal(calls, 2);
  for (const value of [
    null,
    { approved: true },
    f.bootstrap,
    { ...admission, policy: { ...admission.policy, treeSha: 'f'.repeat(40) } },
  ]) {
    errors.length = 0;
    assert.equal(entrypoint.runTrustedSliceRehearsal(request, { ...host, admit: () => value }), 1);
    assert.match(errors.join(''), /admission|policy.*tree/u);
    assert.doesNotMatch(errors.join(''), /dependency loaded/u);
  }
});

test('detects a local anchor changing between observations without changing legacy facts', async t => {
  const f = fixture(t);
  const before = readLocalAnchor(f.targetRoot);
  assert.deepEqual(before, f.bootstrap.target);
  git(f.targetRoot, 'checkout', '-q', '-b', 'changed-branch');
  assert.throws(() => assertLocalAnchor(f.targetRoot, before), /local.*anchor.*changed/iu);
});

for (const mutation of [
  'stable',
  'touch',
  'bytes',
  'create',
  'remove',
  'index',
  'ita',
  'hidden',
  'sparse',
  'unmerged',
  'encoding',
  'new-untracked',
  'untracked-bytes',
  'program',
]) {
  test(`local observation: ${mutation} with unchanged HEAD`, t => {
    const f = fixture(t),
      repo = f.targetRoot,
      file = join(repo, 'scripts/dependency.mjs');
    const extra = join(repo, 'extra.txt');
    writeFileSync(extra, '');
    const unrelated = join(repo, 'unrelated.txt');
    writeFileSync(unrelated, 'initial');
    mkdirSync(join(repo, 'docs/plans'), { recursive: true });
    writeFileSync(join(repo, '.git/info/exclude'), 'docs/plans/\n');
    writeFileSync(join(repo, 'docs/plans/current-program.md'), 'before!');
    if (mutation === 'ita') git(repo, 'add', '-N', 'extra.txt');
    const read = () => factsModule.observeLocalState(repo, ['ignored.mjs', 'extra.txt']);
    const before = read();
    if (mutation === 'stable') writeFileSync(join(repo, 'ignored-editor.txt'), 'ignored\n');
    if (mutation === 'touch') {
      utimesSync(file, new Date(), new Date());
      git(repo, 'update-index', '--refresh');
    }
    if (mutation === 'bytes')
      writeFileSync(file, readFileSync(file, 'utf8').replace('pinned', 'edited'));
    if (mutation === 'create') writeFileSync(join(repo, 'ignored.mjs'), 'relevant\n');
    if (mutation === 'program')
      writeFileSync(join(repo, 'docs/plans/current-program.md'), 'changed');
    if (mutation === 'new-untracked') writeFileSync(join(repo, 'new.txt'), 'new');
    if (mutation === 'untracked-bytes') writeFileSync(unrelated, 'changed');
    if (mutation === 'remove') rmSync(extra);
    if (mutation === 'index') git(repo, 'update-index', '--chmod=+x', 'scripts/dependency.mjs');
    if (mutation === 'ita') git(repo, 'add', 'extra.txt');
    if (mutation === 'hidden')
      git(repo, 'update-index', '--assume-unchanged', 'scripts/dependency.mjs');
    if (mutation === 'sparse') git(repo, 'config', 'core.sparseCheckout', 'true');
    if (mutation === 'unmerged') {
      const object = git(repo, 'rev-parse', 'HEAD:scripts/dependency.mjs');
      execFileSync('/usr/bin/git', ['-C', repo, 'update-index', '--index-info'], {
        env: ENV,
        input: `100644 ${object} 1\tscripts/dependency.mjs\n`,
      });
    }
    if (mutation === 'encoding') {
      const object = git(repo, 'rev-parse', 'HEAD:scripts/dependency.mjs');
      execFileSync('/usr/bin/git', ['-C', repo, 'update-index', '--index-info'], {
        env: ENV,
        input: Buffer.concat([Buffer.from(`100644 ${object} 0\t`), Buffer.from([255, 10])]),
      });
    }
    if (['hidden', 'sparse', 'unmerged', 'encoding'].includes(mutation))
      assert.throws(read, /local observation.*unsupported/iu);
    else if (['stable', 'touch', 'untracked-bytes'].includes(mutation))
      assert.deepEqual(read(), before);
    else assert.notDeepEqual(read(), before);
    assert.deepEqual(identity(repo), f.bootstrap.target);
  });
}
