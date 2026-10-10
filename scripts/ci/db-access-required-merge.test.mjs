import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  ADOPTION_COMMIT,
  SOURCE_COMMIT,
  commit,
  git,
  tmp,
  writeFile,
} from './db-access-required-git.mjs';
import { actualOrigin } from './db-access-required-origins.mjs';
import {
  ambient,
  assertExecutedApproved,
  canonical,
  forgingGuard,
  headOnlyScan,
  openPullRequest,
  route,
} from './db-access-required-fixtures.mjs';

const identityFailure = (result, reason) => {
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /protected DB access guard incomplete/u);
  assert.match(result.stderr, reason);
  assert.equal(result.report, undefined);
  assert.doesNotMatch(result.stdout, /executes on merge/u);
};
const origin = actualOrigin();

test('exact merge, not head: head-only e113 scan passes while the landed merge has a new unsafe query', () => {
  const pr = openPullRequest(
    origin,
    root => writeFile(root, 'apps/web/src/feature.ts', canonical),
    {
      advanceBase: root => writeFile(root, 'apps/web/src/landed.ts', ambient),
    }
  );
  const tree = revision => git(pr.ws, 'rev-parse', `${revision}^{tree}`);
  assert.notEqual(tree(pr.merge), tree(pr.head));
  const headOnly = headOnlyScan(pr);
  assert.equal(headOnly.status, 0, headOnly.stderr);
  assert.equal(headOnly.report.status, 'pass');
  const result = route(pr, {}, { GH_TOKEN: 'ghs_fixture-credential-never-logged' });
  assert.equal(result.status, 1, result.stderr);
  assertExecutedApproved(result);
  assert.ok(result.report.failingNewEntries.some(entry => entry.file === 'apps/web/src/landed.ts'));
  for (const line of [
    'event=pull_request repo=interdomestik/interdomestik pr=1902 base_ref=main',
    `merge=${pr.merge} tree=${tree(pr.merge)}`,
    `base=${pr.base} tree=${tree(pr.base)} role=event-base parent=1 executable=no`,
    `head=${pr.head} tree=${tree(pr.head)} role=candidate parent=2 executable=no`,
  ])
    assert.ok(result.stdout.includes(line), line);
  assert.doesNotMatch(result.stdout + result.stderr, /ghs_fixture/u);
  assert.equal(git(pr.ws, 'rev-parse', 'HEAD'), pr.merge);
  assert.equal(git(pr.ws, 'status', '--porcelain', '--ignored'), '');
});

test('event identity fails closed before any code runs', () => {
  const pr = openPullRequest(origin, root => writeFile(root, 'apps/web/src/feature.ts', canonical));
  for (const [event, reason] of [
    [{ EVENT_NAME: 'push' }, /unsupported event/u],
    [{ EVENT_NAME: 'merge_group' }, /unsupported event/u],
    [{ EVENT_NAME: 'pull_request_target' }, /unsupported event/u],
    [{ EVENT_NAME: '' }, /missing EVENT_NAME/u],
    [{ EVENT_REPO: undefined }, /missing EVENT_REPO/u],
    [{ EVENT_REPO: 'attacker/interdomestik' }, /repository identity/u],
    [{ PR_BASE_REPO: 'attacker/interdomestik' }, /repository identity/u],
    [{ DEFAULT_BRANCH: 'master' }, /base branch identity/u],
    [{ PR_BASE_REF: 'release' }, /base branch identity/u],
    [{ PR_BASE_REF: '' }, /missing PR_BASE_REF/u],
    [{ PR_NUMBER: '0' }, /merge ref identity/u],
    [{ EVENT_REF: 'refs/pull/1903/merge' }, /merge ref identity/u],
    [{ EVENT_REF: 'refs/pull/1902/head' }, /merge ref identity/u],
    [{ EVENT_REF: 'refs/heads/main' }, /merge ref identity/u],
    [{ EVENT_SHA: pr.head }, /not distinct/u],
    [{ EVENT_SHA: pr.merge.toUpperCase() }, /object identity/u],
    [{ EVENT_SHA: pr.merge.slice(0, 12) }, /object identity/u],
    [{ PR_BASE_SHA: 'HEAD' }, /object identity/u],
    [{ PR_HEAD_SHA: undefined }, /missing PR_HEAD_SHA/u],
    [{ TS_EXPECTED_VERSION: '' }, /missing TS_EXPECTED_VERSION/u],
    [{ EVENT_SHA: '1'.repeat(40) }, /not the exact merge commit/u],
    [{ PR_BASE_SHA: '1'.repeat(40) }, /missing base\/head commit object/u],
    [{ PR_HEAD_SHA: '2'.repeat(40) }, /missing base\/head commit object/u],
    [{ PR_BASE_SHA: pr.head, PR_HEAD_SHA: pr.base }, /parents are not exactly/u],
  ])
    identityFailure(route(pr, event), reason);
});

test('checkout must be the exact merge with ordered parents (base, head) and a clean tree', () => {
  const pr = openPullRequest(origin, root => writeFile(root, 'apps/web/src/feature.ts', canonical));
  const tree = git(pr.ws, 'rev-parse', `${pr.merge}^{tree}`);
  const synthetic = (message, ...parents) =>
    git(pr.ws, 'commit-tree', tree, ...parents.flatMap(parent => ['-p', parent]), '-m', message);
  const third = synthetic('third parent', pr.base);
  for (const merge of [
    synthetic('reversed', pr.head, pr.base),
    synthetic('octopus', pr.base, pr.head, third),
    synthetic('base only', pr.base),
    synthetic('head only', pr.head),
  ]) {
    git(pr.ws, 'checkout', '-q', '--detach', merge);
    identityFailure(route(pr, { EVENT_SHA: merge }), /parents are not exactly/u);
  }
  git(pr.ws, 'checkout', '-q', '--detach', pr.head);
  identityFailure(route(pr), /not the exact merge commit/u);
  git(pr.ws, 'checkout', '-q', '--detach', pr.merge);
  writeFile(pr.ws, 'apps/web/src/uncommitted.ts', ambient);
  identityFailure(route(pr), /workspace differs from the merge commit/u);
});

test('event base must be on protected main; shallow, missing refs and in-workspace temp fail closed', () => {
  const sentinel = path.join(tmp('stacked'), 'executed');
  git(origin, 'checkout', '-q', 'main');
  git(origin, 'checkout', '-q', '-b', 'feature');
  writeFile(origin, 'scripts/check-db-access-guard.mjs', forgingGuard(sentinel));
  commit(origin, 'unprotected weakening');
  git(origin, 'checkout', '-q', 'main');
  const stacked = openPullRequest(origin, root => writeFile(root, 'apps/web/src/new.ts', ambient), {
    baseBranch: 'feature',
  });
  identityFailure(route(stacked), /base commit not on protected main/u);
  identityFailure(route(stacked, { PR_BASE_REF: 'feature' }), /base branch identity/u);
  assert.equal(fs.existsSync(sentinel), false);

  const pr = openPullRequest(origin, root => writeFile(root, 'apps/web/src/feature.ts', canonical));
  fs.writeFileSync(path.join(pr.ws, '.git/shallow'), `${pr.base}\n`);
  identityFailure(route(pr), /full local repository/u);
  fs.rmSync(path.join(pr.ws, '.git/shallow'));
  git(pr.ws, 'update-ref', '-d', 'refs/remotes/origin/main');
  identityFailure(route(pr), /protected default ref missing/u);
  git(pr.ws, 'update-ref', 'refs/remotes/origin/main', pr.base);
  const inside = path.join(pr.ws, '.git', 'runner-temp');
  fs.mkdirSync(inside);
  identityFailure(route(pr, {}, { RUNNER_TEMP: inside }), /runner temp inside workspace/u);
});

test('approved source comes only from fetched origin refs by fixed identity; ambient objects or inputs never supply it', () => {
  const bare = actualOrigin(ADOPTION_COMMIT, { authority: false });
  const pr = openPullRequest(bare, root => writeFile(root, 'apps/web/src/feature.ts', canonical));
  // The object exists in the workspace store via alternates, yet is unreferenced and never copied.
  assert.equal(git(pr.ws, 'cat-file', '-t', SOURCE_COMMIT), 'commit');
  identityFailure(
    route(pr, {}, { SOURCE_COMMIT: pr.base, GUARD_SOURCE_REF: 'refs/heads/main' }),
    /approved guard source commit missing/u
  );
  // With the authority branch reachable, the same run proceeds past source checks into lock checks.
  const published = openPullRequest(origin, root =>
    writeFile(root, 'apps/web/src/feature.ts', canonical)
  );
  const reached = route(published, { TS_EXPECTED_VERSION: '5.9.2' });
  identityFailure(reached, /is not 5\.9\.2/u);
  assert.ok(reached.stdout.includes(`source=${SOURCE_COMMIT} `));
});
