// Contract tests of the revision extraction shared by the server-mutation (CHK-04/05/26) and the
// screen-contract scanners (WP-05 code review r3, blocker 2). A scanned revision is untrusted
// data: its files are written from the raw blobs after the tree modes are checked, so no checkout
// filter, attribute or link of the revision takes effect on the runner.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ScanError } from './server-mutation/ast.mjs';
import { extractRevision, showAt } from './server-mutation/git.mjs';
import {
  commit,
  git,
  initRepo,
  runCli,
  tempDir,
} from './fixtures/server-mutation-check/harness.mjs';
import { scenario, tree, cleanBaseline } from './fixtures/server-mutation-check/cli-tree.mjs';
import { SCANNER as SCREEN_SCANNER } from './fixtures/screen-contract-check/harness.mjs';

function extracted(t, sha, repo) {
  const dir = extractRevision(repo, sha);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A commit holding one entry of the given mode, staged by hash (no file of that kind is needed).
function commitEntry(repo, mode, objectSha, rel) {
  git(repo, 'update-index', '--add', '--cacheinfo', `${mode},${objectSha},${rel}`);
  git(repo, 'commit', '--quiet', '-m', `${mode} ${rel}`);
  return git(repo, 'rev-parse', 'HEAD');
}

const blobOf = (repo, text) =>
  spawnSync('/usr/bin/git', ['-C', repo, 'hash-object', '-w', '--stdin'], {
    input: text,
    encoding: 'utf8',
  }).stdout.trim();

test('a revision is written byte for byte, with its executable bit', t => {
  const repo = initRepo(tempDir(t));
  const sha = commit(repo, { 'a/b.txt': 'one\r\ntwo\n', 'run.sh': '#!/bin/sh\n' });
  fs.chmodSync(path.join(repo, 'run.sh'), 0o755);
  git(repo, 'add', '-A');
  git(repo, 'commit', '--quiet', '-m', 'exec');
  const head = git(repo, 'rev-parse', 'HEAD');
  const dir = extracted(t, head, repo);
  assert.equal(fs.readFileSync(path.join(dir, 'a/b.txt'), 'utf8'), 'one\r\ntwo\n');
  assert.equal(fs.statSync(path.join(dir, 'run.sh')).mode & 0o111, 0o111);
  assert.equal(fs.statSync(path.join(dir, 'a/b.txt')).mode & 0o111, 0);
  assert.ok(sha);
});

test("the revision's attributes do not run a checkout filter the runner has configured", t => {
  const repo = initRepo(tempDir(t));
  const marker = path.join(tempDir(t, 'smc-marker-'), 'ran');
  git(repo, 'config', 'filter.probe.smudge', `sh -c 'touch "${marker}"; tr a-z A-Z'`);
  git(repo, 'config', 'filter.probe.clean', 'cat');
  git(repo, 'config', 'filter.probe.required', 'true');
  git(repo, 'config', 'core.autocrlf', 'true');
  const sha = commit(repo, {
    '.gitattributes': '*.txt filter=probe\n*.crlf text eol=crlf\n',
    'x.txt': 'raw text\n',
    'y.crlf': 'line\n',
  });
  fs.rmSync(marker, { force: true });
  const dir = extracted(t, sha, repo);
  assert.equal(fs.existsSync(marker), false, 'the smudge filter ran');
  assert.equal(fs.readFileSync(path.join(dir, 'x.txt'), 'utf8'), 'raw text\n');
  assert.equal(fs.readFileSync(path.join(dir, 'y.crlf'), 'utf8'), 'line\n');
});

test('a committed symbolic link is refused, also where links would be written as files', t => {
  const repo = initRepo(tempDir(t));
  commit(repo, { 'ok.txt': 'ok\n' });
  git(repo, 'config', 'core.symlinks', 'false');
  const sha = commitEntry(repo, '120000', blobOf(repo, '/etc'), 'apps/web/src/link');
  assert.throws(
    () => extracted(t, sha, repo),
    error =>
      error instanceof ScanError && /apps\/web\/src\/link is a symbolic link/u.test(error.message)
  );
});

test('a submodule entry is refused', t => {
  const repo = initRepo(tempDir(t));
  const first = commit(repo, { 'ok.txt': 'ok\n' });
  const sha = commitEntry(repo, '160000', first, 'vendor/sub');
  assert.throws(() => extracted(t, sha, repo), /vendor\/sub is a submodule/u);
});

test('the server-mutation CLI refuses a head with a symbolic link', t => {
  const { repo, baseSha } = scenario(t, tree(cleanBaseline()), tree(cleanBaseline()));
  const head = commitEntry(repo, '120000', blobOf(repo, '/etc'), 'apps/web/src/app/x');
  const { code, report } = runCli(repo, ['--base', baseSha, '--head', head]);
  assert.equal(code, 2);
  assert.match(report.errors.join('\n'), /apps\/web\/src\/app\/x is a symbolic link/u);
});

test('the screen-contract CLI refuses a head with a submodule', t => {
  const repo = initRepo(tempDir(t));
  const base = commit(repo, { 'apps/web/src/app/ok/page.tsx': 'export default () => null;\n' });
  const head = commitEntry(repo, '160000', base, 'apps/web/src/vendor');
  const { code, report } = runCli(repo, ['--base', base, '--head', head], SCREEN_SCANNER);
  assert.equal(code, 2);
  assert.match(report.errors.join('\n'), /apps\/web\/src\/vendor is a submodule/u);
});

test('a file read at a revision is its raw blob, with no textconv applied', t => {
  const repo = initRepo(tempDir(t));
  git(repo, 'config', 'diff.probe.textconv', 'tr a-z A-Z <');
  const sha = commit(repo, { '.gitattributes': '*.json diff=probe\n', 'x.json': '{ "a": 1 }\n' });
  assert.equal(showAt(repo, sha, 'x.json'), '{ "a": 1 }\n');
  assert.equal(showAt(repo, sha, 'missing.json'), null);
});
