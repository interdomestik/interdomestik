import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { collectGitChangeFacts } from '../repo-size-git-attribution.mjs';

const GIT_BIN = '/usr/bin/git';
const SAFE_ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });

function git(cwd, args, encoding = 'utf8') {
  return execFileSync(GIT_BIN, args, { cwd, encoding, env: SAFE_ENV }).toString().trim();
}

function createShallowFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-size-shallow-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const origin = path.join(root, 'origin.git');
  const seed = path.join(root, 'seed');
  const shallow = path.join(root, 'shallow');

  git(root, ['init', '--bare', origin]);
  git(root, ['init', seed]);
  git(seed, ['config', 'user.name', 'Repo Size Test']);
  git(seed, ['config', 'user.email', 'repo-size@example.invalid']);
  fs.writeFileSync(path.join(seed, 'tracked.txt'), 'base\n');
  git(seed, ['add', 'tracked.txt']);
  git(seed, ['commit', '-m', 'base']);
  const baseSha = git(seed, ['rev-parse', 'HEAD']);

  fs.writeFileSync(path.join(seed, 'tracked.txt'), 'candidate content\n');
  fs.writeFileSync(path.join(seed, 'added.txt'), 'added\n');
  git(seed, ['add', 'tracked.txt', 'added.txt']);
  git(seed, ['commit', '-m', 'candidate']);
  git(seed, ['branch', '-M', 'main']);
  git(seed, ['remote', 'add', 'origin', `file://${origin}`]);
  git(seed, ['push', '-u', 'origin', 'main']);
  git(root, ['clone', '--depth=1', '--branch', 'main', `file://${origin}`, shallow]);

  return { shallow, baseSha };
}

test('Git attribution materializes the exact missing base in a depth-one checkout', t => {
  const { shallow, baseSha } = createShallowFixture(t);
  assert.throws(
    () => git(shallow, ['cat-file', '-e', `${baseSha}^{commit}`]),
    /Not a valid object name/u
  );

  const facts = collectGitChangeFacts({
    repoRoot: shallow,
    baseSha,
    trackedFiles: ['added.txt', 'tracked.txt'],
    gitBin: GIT_BIN,
    env: SAFE_ENV,
  });

  assert.deepEqual(facts, [
    { path: 'added.txt', bytesDelta: 6, filesDelta: 1 },
    { path: 'tracked.txt', bytesDelta: 13, filesDelta: 0 },
  ]);
  assert.equal(git(shallow, ['cat-file', '-e', `${baseSha}^{commit}`]), '');
});

test('Git attribution fails closed when the exact base cannot be fetched', t => {
  const { shallow } = createShallowFixture(t);
  assert.throws(
    () =>
      collectGitChangeFacts({
        repoRoot: shallow,
        baseSha: 'f'.repeat(40),
        trackedFiles: ['added.txt', 'tracked.txt'],
        gitBin: GIT_BIN,
        env: SAFE_ENV,
      }),
    /Unable to materialize exact repo-size baseline/u
  );
});
