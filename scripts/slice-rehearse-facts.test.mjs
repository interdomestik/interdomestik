import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from './slice-rehearse-core.mjs';
import { collectRepositoryFacts } from './slice-rehearse.mjs';

const GIT = '/usr/bin/git';
const ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });

function git(repository, args) {
  return execFileSync(GIT, args, { cwd: repository, encoding: 'utf8', env: ENV }).trim();
}

function repositoryFixture() {
  const root = mkdtempSync(join(tmpdir(), 'slice-rehearse-facts-'));
  const remote = join(root, 'remote.git');
  const repository = join(root, 'repo');
  execFileSync(GIT, ['init', '-q', '--bare', remote], { env: ENV });
  execFileSync(GIT, ['init', '-q', '-b', 'main', repository], { env: ENV });
  git(repository, ['config', 'user.email', 'harness@example.test']);
  git(repository, ['config', 'user.name', 'Harness Test']);
  git(repository, ['remote', 'add', 'origin', 'https://github.com/example/rehearse.git']);
  git(repository, [
    'config',
    `url.file://${remote}.insteadOf`,
    'https://github.com/example/rehearse.git',
  ]);
  writeFileSync(join(repository, 'anchor.txt'), 'anchor\n');
  git(repository, ['add', '.']);
  git(repository, ['commit', '-q', '-m', 'capacity baseline']);
  const capacityBaselineSha = git(repository, ['rev-parse', 'HEAD']);
  writeFileSync(join(repository, 'late.txt'), 'late\n');
  git(repository, ['add', 'late.txt']);
  git(repository, ['commit', '-q', '-m', 'manifest base']);
  const manifestBaseSha = git(repository, ['rev-parse', 'HEAD']);
  git(repository, ['push', '-q', 'origin', 'HEAD:refs/heads/main']);
  git(repository, ['update-ref', 'refs/remotes/origin/main', manifestBaseSha]);
  return {
    root,
    remote,
    repository,
    capacityBaselineSha,
    manifestBaseSha,
  };
}

test('writer existence uses manifest base while capacity deltas use the capacity baseline', () => {
  const fixture = repositoryFixture();
  try {
    writeFileSync(join(fixture.repository, 'empty-new.txt'), '');
    const facts = collectRepositoryFacts({
      cwd: fixture.repository,
      baseSha: fixture.manifestBaseSha,
      budgetBaselineSha: fixture.capacityBaselineSha,
      capacityOwnerPaths: ['anchor.txt', 'late.txt'],
      protectedMainSha: fixture.manifestBaseSha,
      writerPaths: ['empty-new.txt', 'late.txt'],
    });
    assert.deepEqual(facts.writerFacts, {
      'empty-new.txt': {
        currentBytes: 0,
        currentExists: true,
        currentSha256: sha256(''),
        manifestBaseBytes: 0,
        manifestBaseExists: false,
      },
      'late.txt': {
        currentBytes: 5,
        currentExists: true,
        currentSha256: sha256('late\n'),
        manifestBaseBytes: 5,
        manifestBaseExists: true,
      },
    });
    assert.deepEqual(facts.writerDeltas, {
      'empty-new.txt': {
        baseBytes: 0,
        bytes: 0,
        capacityBaselineExists: false,
        currentBytes: 0,
        currentSha256: sha256(''),
        currentExists: true,
        files: 1,
        manifestBaseExists: false,
      },
      'late.txt': {
        baseBytes: 0,
        bytes: 5,
        capacityBaselineExists: false,
        currentBytes: 5,
        currentSha256: sha256('late\n'),
        currentExists: true,
        files: 1,
        manifestBaseExists: true,
      },
    });
    assert.match(facts.writerFactsDigest, /^[0-9a-f]{64}$/u);
    assert.deepEqual(facts.capacityOwnerDeltas, {
      'anchor.txt': {
        bytes: 0,
        capacityBaselineExists: true,
        currentBytes: 7,
        currentExists: true,
        currentSha256: sha256('anchor\n'),
        files: 0,
      },
      'late.txt': {
        bytes: 5,
        capacityBaselineExists: false,
        currentBytes: 5,
        currentExists: true,
        currentSha256: sha256('late\n'),
        files: 1,
      },
    });
    writeFileSync(join(fixture.repository, 'late.txt'), 'LATE\n');
    const changedHashFacts = collectRepositoryFacts({
      cwd: fixture.repository,
      baseSha: fixture.manifestBaseSha,
      budgetBaselineSha: fixture.capacityBaselineSha,
      protectedMainSha: fixture.manifestBaseSha,
      writerPaths: ['empty-new.txt', 'late.txt'],
    });
    assert.equal(changedHashFacts.writerDeltas['late.txt'].currentBytes, 5);
    assert.notEqual(changedHashFacts.writerFactsDigest, facts.writerFactsDigest);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
test('protected-main anchoring defeats base equals HEAD and reports both rename paths', () => {
  const fixture = repositoryFixture();
  try {
    git(fixture.repository, ['mv', 'late.txt', 'renamed.txt']);
    git(fixture.repository, ['commit', '-q', '-m', 'rename outside declared base']);
    const headSha = git(fixture.repository, ['rev-parse', 'HEAD']);
    const facts = collectRepositoryFacts({
      cwd: fixture.repository,
      baseSha: headSha,
      protectedMainSha: fixture.manifestBaseSha,
      writerPaths: ['late.txt', 'renamed.txt'],
    });
    assert.equal(facts.baseSha, headSha);
    assert.equal(facts.protectedMainSha, fixture.manifestBaseSha);
    assert.equal(facts.mergeBaseSha, fixture.manifestBaseSha);
    assert.deepEqual(facts.committedChangedPaths, ['late.txt', 'renamed.txt']);
    assert.equal(facts.baseIsAncestor, true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
test('advanced protected main uses three-dot slice scope and reports disjoint or overlapping paths', () => {
  const fixture = repositoryFixture();
  try {
    git(fixture.repository, ['checkout', '-q', '-b', 'slice']);
    writeFileSync(join(fixture.repository, 'late.txt'), 'slice\n');
    git(fixture.repository, ['commit', '-qam', 'slice writer']);
    git(fixture.repository, ['checkout', '-q', '-b', 'protected', fixture.manifestBaseSha]);
    writeFileSync(join(fixture.repository, 'upstream.txt'), 'upstream\n');
    git(fixture.repository, ['add', 'upstream.txt']);
    git(fixture.repository, ['commit', '-q', '-m', 'disjoint protected main']);
    const disjointMainSha = git(fixture.repository, ['rev-parse', 'HEAD']);
    git(fixture.repository, ['checkout', '-q', 'slice']);
    const disjoint = collectRepositoryFacts({
      cwd: fixture.repository,
      baseSha: fixture.manifestBaseSha,
      protectedMainSha: disjointMainSha,
      writerPaths: ['late.txt'],
    });
    assert.equal(disjoint.mergeBaseSha, fixture.manifestBaseSha);
    assert.deepEqual(disjoint.committedChangedPaths, ['late.txt']);
    assert.deepEqual(disjoint.protectedMainAdvancedPaths, ['upstream.txt']);
    git(fixture.repository, ['checkout', '-q', 'protected']);
    writeFileSync(join(fixture.repository, 'late.txt'), 'protected\n');
    git(fixture.repository, ['commit', '-qam', 'overlapping protected main']);
    const overlapMainSha = git(fixture.repository, ['rev-parse', 'HEAD']);
    git(fixture.repository, ['checkout', '-q', 'slice']);
    const overlap = collectRepositoryFacts({
      cwd: fixture.repository,
      baseSha: fixture.manifestBaseSha,
      protectedMainSha: overlapMainSha,
      writerPaths: ['late.txt'],
    });
    assert.deepEqual(overlap.committedChangedPaths, ['late.txt']);
    assert.deepEqual(overlap.protectedMainAdvancedPaths, ['late.txt', 'upstream.txt']);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('missing verified protected-main authority evidence fails closed', () => {
  const fixture = repositoryFixture();
  try {
    assert.throws(
      () =>
        collectRepositoryFacts({
          cwd: fixture.repository,
          baseSha: fixture.manifestBaseSha,
          writerPaths: ['late.txt'],
        }),
      /verified protected-main authority evidence is unavailable/iu
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Git reads disable fsmonitor and writer reads reject symlinks', () => {
  const fixture = repositoryFixture();
  try {
    const marker = join(fixture.root, 'fsmonitor-ran');
    const monitor = join(fixture.root, 'fsmonitor.sh');
    writeFileSync(monitor, `#!/bin/sh\ntouch '${marker}'\n`);
    chmodSync(monitor, 0o700);
    git(fixture.repository, ['config', 'core.fsmonitor', monitor]);
    collectRepositoryFacts({
      cwd: fixture.repository,
      baseSha: fixture.manifestBaseSha,
      protectedMainSha: fixture.manifestBaseSha,
      writerPaths: ['late.txt'],
    });
    assert.equal(existsSync(marker), false);
    for (const [hidden, visible] of [
      ['--skip-worktree', '--no-skip-worktree'],
      ['--assume-unchanged', '--no-assume-unchanged'],
    ]) {
      git(fixture.repository, ['update-index', hidden, 'late.txt']);
      assert.throws(
        () =>
          collectRepositoryFacts({
            cwd: fixture.repository,
            baseSha: fixture.manifestBaseSha,
            protectedMainSha: fixture.manifestBaseSha,
            writerPaths: ['late.txt'],
          }),
        /hidden index state/iu
      );
      git(fixture.repository, ['update-index', visible, 'late.txt']);
    }
    assert.throws(
      () =>
        collectRepositoryFacts({
          cwd: fixture.repository,
          baseSha: fixture.manifestBaseSha,
          protectedMainSha: fixture.manifestBaseSha,
          writerPaths: [':(glob)**'],
        }),
      /pathspec magic/iu
    );
    execFileSync('/usr/bin/mkfifo', [join(fixture.repository, 'writer.pipe')], { env: ENV });
    assert.throws(
      () =>
        collectRepositoryFacts({
          cwd: fixture.repository,
          baseSha: fixture.manifestBaseSha,
          protectedMainSha: fixture.manifestBaseSha,
          writerPaths: ['writer.pipe'],
        }),
      /regular file/iu
    );
    writeFileSync(join(fixture.repository, 'oversized.txt'), Buffer.alloc(16 * 1024 * 1024 + 1));
    assert.throws(
      () =>
        collectRepositoryFacts({
          cwd: fixture.repository,
          baseSha: fixture.manifestBaseSha,
          protectedMainSha: fixture.manifestBaseSha,
          writerPaths: ['oversized.txt'],
        }),
      /read bound/iu
    );
    symlinkSync(join(fixture.root, 'outside.txt'), join(fixture.repository, 'linked.txt'));
    assert.throws(
      () =>
        collectRepositoryFacts({
          cwd: fixture.repository,
          baseSha: fixture.manifestBaseSha,
          protectedMainSha: fixture.manifestBaseSha,
          writerPaths: ['linked.txt'],
        }),
      /regular file/u
    );
    git(fixture.repository, ['-c', 'core.fsmonitor=false', 'add', 'linked.txt']);
    assert.throws(
      () =>
        collectRepositoryFacts({
          cwd: fixture.repository,
          baseSha: fixture.manifestBaseSha,
          protectedMainSha: fixture.manifestBaseSha,
          writerPaths: ['late.txt'],
        }),
      /tracked path is not a regular file/iu
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
