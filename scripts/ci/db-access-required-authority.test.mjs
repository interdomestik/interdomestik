import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  ADOPTION_COMMIT,
  ADOPTION_TREE,
  SOURCE_COMMIT,
  SOURCE_TREE,
  commit,
  git,
  tmp,
  writeFile,
} from './db-access-required-git.mjs';
import { actualOrigin } from './db-access-required-origins.mjs';
import {
  ambient,
  assertPassed,
  assertRejected,
  canonical,
  fakeEpoch,
  forgingGuard,
  openPullRequest,
  route,
} from './db-access-required-fixtures.mjs';

for (const [label, base] of [
  ['actual 278e adoption', ADOPTION_COMMIT],
  ['actual e113 source', SOURCE_COMMIT],
])
  test(`${label} event base: approved e113 guard passes canonical, rejects new ambient access`, () => {
    const origin = actualOrigin(base);
    const passing = route(
      openPullRequest(origin, root =>
        writeFile(root, 'apps/web/src/required-authority-positive.ts', canonical)
      )
    );
    assertPassed(passing);
    assert.equal(passing.report.newCount, 1);
    assert.match(passing.stdout, /new=1 failing_new=0 source_baseline_entries=604/u);
    const baseTree = git(origin, 'rev-parse', `${base}^{tree}`);
    assert.ok(
      passing.stdout.includes(
        `base=${base} tree=${baseTree} role=event-base parent=1 executable=no`
      )
    );
    const unsafe = 'apps/web/src/required-authority-unsafe.ts';
    assertRejected(
      route(openPullRequest(origin, root => writeFile(root, unsafe, ambient))),
      unsafe
    );
  });

for (const target of ['scripts/check-db-access-guard.mjs', 'scripts/ci/db-access-evaluator.mjs'])
  test(`roll-forward: squash main with forged ${target} and fake epoch still runs e113`, () => {
    const origin = actualOrigin();
    const squash = git(
      origin,
      'commit-tree',
      SOURCE_TREE,
      '-p',
      ADOPTION_COMMIT,
      '-m',
      'squash-merged PR1902 shape'
    );
    git(origin, 'reset', '-q', '--hard', squash);
    assert.throws(() => git(origin, 'merge-base', '--is-ancestor', SOURCE_COMMIT, 'main'));
    const sentinel = path.join(tmp('roll-forward'), 'executed');
    writeFile(origin, target, forgingGuard(sentinel));
    writeFile(origin, 'scripts/ci/db-access-adoption.mjs', fakeEpoch(squash, SOURCE_TREE));
    const rolled = commit(origin, 'PR-A: permission-neutral weakening merged into main');
    const unsafe = 'apps/web/src/successor-unsafe.ts';
    const pr = openPullRequest(origin, root => writeFile(root, unsafe, ambient));
    assert.equal(pr.base, rolled);
    assertRejected(route(pr), unsafe);
    assert.equal(fs.existsSync(sentinel), false);
  });

test('roll-forward from 278e: forged entrypoint/evaluator, fake epoch and washed baseline are inert data', () => {
  const origin = actualOrigin();
  const sentinel = path.join(tmp('roll-forward'), 'executed');
  writeFile(origin, 'scripts/check-db-access-guard.mjs', forgingGuard(sentinel));
  writeFile(origin, 'scripts/ci/db-access-evaluator.mjs', forgingGuard(sentinel));
  writeFile(origin, 'scripts/ci/db-access-adoption.mjs', fakeEpoch(ADOPTION_COMMIT, ADOPTION_TREE));
  writeFile(
    origin,
    'scripts/ci/db-access-baseline.json',
    JSON.stringify({ version: 2, entries: [] })
  );
  const rolled = commit(origin, 'PR-A: weakened base guard, evaluator, epoch and baseline');
  const pr = openPullRequest(origin, root =>
    writeFile(root, 'apps/web/src/successor-unsafe.ts', ambient)
  );
  assert.equal(pr.base, rolled);
  const result = route(pr);
  assertRejected(result);
  assert.ok(result.stdout.includes(`base=${rolled} `));
  assert.equal(fs.existsSync(sentinel), false);
});
