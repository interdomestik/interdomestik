import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { selectRepository } from './contract-suite-surface.mjs';

const full = (reason, firstPathOutside = null) => ({ lane: 'full', reason, firstPathOutside });
const product = { lane: 'product', reason: 'product-paths-only', firstPathOutside: null };
const gitEnv = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' };

function repository(t, { prepareBase, changePr, changeTested, directHead = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-surface-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync(
      '/usr/bin/git',
      ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
      {
        cwd: root,
        encoding: 'utf8',
        env: gitEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      }
    ).trim();
  function write(file, content = 'base\n') {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  const remove = file => fs.rmSync(path.join(root, file));
  const commit = (label, ...parents) =>
    git(
      'commit-tree',
      git('write-tree'),
      '-m',
      label,
      ...parents.flatMap(parent => ['-p', parent])
    );
  git('init', '--quiet', '--template=');
  for (const dir of ['apps', 'packages', 'docs', 'tools']) write(`${dir}/a`);
  prepareBase?.({ root, write, remove });
  git('add', '-A');
  const base = commit('base');

  const fixture = { root, write, remove, git, base };
  if (changePr) changePr(fixture);
  else write('apps/a', 'ready PR change\n');
  git('add', '-A');
  const head = commit('PR head', base);

  if (changeTested) {
    changeTested(fixture);
    git('add', '-A');
  }
  const tested = directHead ? head : commit('tested merge', base, head);
  git('update-ref', 'HEAD', tested);
  return {
    root,
    env: {
      ...gitEnv,
      EVENT_NAME: 'pull_request',
      BASE_SHA: base,
      HEAD_SHA: head,
      PR_DRAFT: 'false',
    },
  };
}

test('real merge is product, while OD17 direct PR head checkout is full', t => {
  assert.deepEqual(selectRepository(repository(t)), product);
  assert.deepEqual(
    selectRepository(repository(t, { directHead: true })),
    full('merge-parents-mismatch')
  );
});

test('empty Git diffs for either tree choose full', t => {
  const emptyPr = repository(t, { changePr() {} });
  assert.deepEqual(selectRepository(emptyPr), full('invalid-pr-diff'));
  const emptyTested = repository(t, { changeTested: ({ write }) => write('apps/a') });
  assert.deepEqual(selectRepository(emptyTested), full('invalid-tested-tree-diff'));
});

test('tested-tree diff catches a PR edit moved outside the roots on main', t => {
  const fixture = repository(t, {
    changeTested: ({ root }) =>
      fs.renameSync(path.join(root, 'apps/a'), path.join(root, 'tools/moved')),
  });
  assert.deepEqual(selectRepository(fixture), full('path-outside-product-roots', 'tools/moved'));
});

test('Git rename and copy semantics count changed endpoints, including deletions', t => {
  for (const [from, to, external] of [
    ['tools/a', 'apps/b', 'tools/a'],
    ['apps/a', 'tools/b', 'tools/b'],
  ]) {
    const rename = repository(t, {
      changePr: ({ root }) => fs.renameSync(path.join(root, from), path.join(root, to)),
    });
    assert.deepEqual(selectRepository(rename), full('path-outside-product-roots', external));
  }
  const copyIntoApps = repository(t, { changePr: ({ write }) => write('apps/b') });
  assert.deepEqual(selectRepository(copyIntoApps), product);
  const copyIntoTools = repository(t, { changePr: ({ write }) => write('tools/b') });
  assert.deepEqual(selectRepository(copyIntoTools), full('path-outside-product-roots', 'tools/b'));
  const deletion = repository(t, { changePr: ({ remove }) => remove('tools/a') });
  assert.deepEqual(selectRepository(deletion), full('path-outside-product-roots', 'tools/a'));
});

test('Git shows gitlink changes even when local diff config ignores them', t => {
  for (const file of ['tools/submodule', 'apps/submodule']) {
    const fixture = repository(t, {
      changePr({ root, git, base }) {
        git('config', 'diff.ignoreSubmodules', 'all');
        git('update-index', '--add', '--cacheinfo', `160000,${base},${file}`);
        // Leave a directory at the gitlink so `git add -A` keeps the index entry.
        fs.mkdirSync(path.join(root, file));
      },
    });
    assert.deepEqual(
      selectRepository(fixture),
      file.startsWith('apps/') ? product : full('path-outside-product-roots', file)
    );
  }
});

test('restoring a missing root, deleting a whole root or replacing a root with a file chooses full', t => {
  const restored = repository(t, {
    prepareBase: ({ remove }) => remove('docs/a'),
    changePr: ({ write }) => write('docs/a'),
  });
  assert.deepEqual(selectRepository(restored), full('missing-root-tree'));
  const deleted = repository(t, { changePr: ({ remove }) => remove('docs/a') });
  assert.deepEqual(selectRepository(deleted), full('missing-root-tree'));
  const nonTree = repository(t, {
    prepareBase({ root, remove, write }) {
      remove('docs/a');
      fs.rmdirSync(path.join(root, 'docs'));
      write('docs');
    },
    changePr: ({ write }) => write('apps/b'),
  });
  assert.deepEqual(selectRepository(nonTree), full('missing-root-tree'));
});

test('a real Git error or timeout chooses full without logging child output', t => {
  const fixture = repository(t);
  assert.deepEqual(
    selectRepository({ ...fixture, root: path.join(fixture.root, 'absent') }),
    full('git-error')
  );
  assert.deepEqual(
    selectRepository({
      ...fixture,
      exec(file, args, options) {
        assert.equal(file, '/usr/bin/git');
        assert.deepEqual(args, ['rev-list', '--parents', '-n', '1', 'HEAD']);
        assert.equal(options.env.PATH, gitEnv.PATH);
        assert.equal(options.timeout, 30_000);
        assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
        throw Object.assign(new Error('git fixture timed out'), { code: 'ETIMEDOUT' });
      },
    }),
    full('git-timeout')
  );
});

test('selector CLI emits one printable JSON record for a path with controls', t => {
  const file = 'tools/a\n\t\x1b\u0085';
  const { root, env } = repository(t, { changePr: ({ write }) => write(file) });
  const cli = fileURLToPath(new URL('./contract-suite-surface.mjs', import.meta.url));
  const output = execFileSync(process.execPath, [cli], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.match(output, /^[ -~]+\n$/u);
  assert.deepEqual(
    JSON.parse(output),
    full('path-outside-product-roots', Buffer.from(file).toString('latin1'))
  );
});
