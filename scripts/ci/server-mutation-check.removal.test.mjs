// A check's life after an owner-approved removal (Astra r2 B10), and equal settings hashing
// equally (Astra r2 B11).
import assert from 'node:assert/strict';
import test from 'node:test';

import { CHECKS, predicateDigest } from './server-mutation/evaluate.mjs';
import { commit, json, runCli } from './fixtures/server-mutation-check/harness.mjs';
import {
  BASELINE,
  cleanBaseline,
  removalException,
  scenario,
  tree,
  withoutCheck,
} from './fixtures/server-mutation-check/cli-tree.mjs';

const enforcing = () => cleanBaseline({ 'CHK-05b': { mode: 'fail' } });
const removed = () => ({
  ...withoutCheck(enforcing(), 'CHK-05b'),
  exceptions: [removalException('CHK-05b')],
});

test('the PR after an approved check removal scans cleanly, and must keep the removal record', t => {
  const { repo, headSha: removalSha } = scenario(t, tree(enforcing()), tree(removed()));
  const later = commit(repo, { 'packages/p/src/later.ts': 'export const x = 1;\n' }, 'later');
  const next = runCli(repo, ['--base', removalSha, '--head', later]);
  assert.equal(next.code, 0, JSON.stringify(next.report.errors));
  assert.deepEqual(next.report.checks['CHK-05b'].tamper, []);
  assert.equal(runCli(repo, ['--base', removalSha, '--enforcing']).code, 0);
  // Dropping the record would leave every later base without its approval.
  const dropped = commit(repo, { [BASELINE]: json(withoutCheck(enforcing(), 'CHK-05b')) }, 'drop');
  const refused = runCli(repo, ['--base', removalSha, '--head', dropped]);
  assert.equal(refused.code, 2);
  assert.match(refused.report.errors[0], /drops the recorded removal of CHK-05b/u);
});

test('a record of removal that only the head carries does not excuse a missing check', t => {
  const head = removed();
  const { repo, baseSha } = scenario(t, tree(withoutCheck(enforcing(), 'CHK-05b')), tree(head));
  const { code, report } = runCli(repo, ['--base', baseSha]);
  assert.equal(code, 2);
  assert.match(report.errors[0], /head baseline has no CHK-05b/u);
});

test('a retired check the base enforces is judged as a removal, not as an unknown check', t => {
  const retired = { ...enforcing().checks['CHK-05b'], items: ['x'], exhausted: undefined };
  const base = cleanBaseline();
  base.checks['CHK-00'] = retired;
  const plain = scenario(t, tree(base), tree(cleanBaseline()));
  const refused = runCli(plain.repo, ['--base', plain.baseSha]);
  assert.equal(refused.code, 1, JSON.stringify(refused.report.errors));
  assert.deepEqual(refused.report.checks['CHK-00'].tamper, ['CHK-00#removed-check']);
  assert.equal(runCli(plain.repo, ['--base', plain.baseSha, '--enforcing']).code, 1);
  const approved = { ...cleanBaseline(), exceptions: [removalException('CHK-00')] };
  const owned = scenario(t, tree(base), tree(approved));
  assert.equal(runCli(owned.repo, ['--base', owned.baseSha]).code, 0);
  assert.equal(runCli(owned.repo, ['--base', owned.baseSha, '--check', 'CHK-04']).code, 0);
});

test('the digest is the same for equal settings in another member order', () => {
  const chk26 = CHECKS.find(check => check.id === 'CHK-26');
  const settings = { unit: 'u', predicate: 'p', coverageMin: { route: 17, page: 18 } };
  const reordered = { ...settings, coverageMin: { page: 18, route: 17 } };
  assert.equal(predicateDigest(chk26, reordered), predicateDigest(chk26, settings));
  const changed = { ...settings, coverageMin: { page: 18, route: 16 } };
  assert.notEqual(predicateDigest(chk26, changed), predicateDigest(chk26, settings));
});

// A check the base enforced once, removed with the owner's record, then retired from the scanner:
// `CHK-00` stands for it, since the fixture scanner never had it.
const retiredBase = () => {
  const base = cleanBaseline();
  base.checks['CHK-00'] = { ...enforcing().checks['CHK-05b'], items: ['x'], exhausted: undefined };
  return base;
};

test('the removal record of a retired check must be kept as well (Astra r3 B10)', t => {
  const removedRetired = { ...cleanBaseline(), exceptions: [removalException('CHK-00')] };
  const { repo, headSha: removalSha } = scenario(t, tree(retiredBase()), tree(removedRetired));
  const kept = commit(repo, { 'packages/p/src/later.ts': 'export const x = 1;\n' }, 'later');
  assert.equal(runCli(repo, ['--base', removalSha, '--head', kept]).code, 0);
  const dropped = commit(repo, { [BASELINE]: json(cleanBaseline()) }, 'drop');
  for (const extra of [[], ['--enforcing']]) {
    const refused = runCli(repo, ['--base', removalSha, '--head', dropped, ...extra]);
    assert.equal(refused.code, 2, extra.join(' '));
    assert.match(refused.report.errors[0], /drops the recorded removal of CHK-00/u);
  }
});

// Design addendum 3 (owner, after Astra r4 B15/B18): a scoped replay judges only its check and
// ignores every other entry; a live run refuses a check this scanner does not have in the head.
test('scoped replay of one check ignores every other entry, known or unknown (r3 B15)', t => {
  const { repo, baseSha, headSha } = scenario(t, tree(retiredBase()), tree(retiredBase()));
  const scoped = runCli(repo, ['--base', baseSha, '--head', headSha, '--check', 'CHK-05b']);
  assert.equal(scoped.code, 0, JSON.stringify(scoped.report.errors));
  assert.deepEqual(Object.keys(scoped.report.checks), ['CHK-05b']);
  assert.equal(
    scoped.report.checks['CHK-05b'].digest,
    predicateDigest(
      CHECKS.find(c => c.id === 'CHK-05b'),
      retiredBase().checks['CHK-05b']
    )
  );
  const odd = cleanBaseline({ 'CHK-26': { mode: 'bogus' } });
  odd.checks['CHK-77'] = { mode: 'fail' };
  const other = scenario(t, tree(cleanBaseline()), tree(odd));
  assert.equal(runCli(other.repo, ['--base', other.baseSha, '--check', 'CHK-05b']).code, 0);
  assert.equal(runCli(other.repo, ['--base', other.baseSha]).code, 2);
});

test('a live head that keeps a deleted check, or names any unknown check, exits 2 (r4 B18, B15)', t => {
  const kept = scenario(t, tree(retiredBase()), tree(retiredBase()));
  for (const extra of [[], ['--enforcing']]) {
    const refused = runCli(kept.repo, ['--base', kept.baseSha, ...extra]);
    assert.equal(refused.code, 2, extra.join(' '));
    assert.match(refused.report.errors[0], /head baseline names an unknown check CHK-00/u);
  }
  for (const id of ['constructor', '__proto__', 'toString', 'CHK-99']) {
    const head = cleanBaseline();
    Object.defineProperty(head.checks, id, {
      value: { ...enforcing().checks['CHK-05b'] },
      enumerable: true,
    });
    const intro = scenario(t, tree(cleanBaseline()), tree(head));
    for (const extra of [[], ['--enforcing']]) {
      const refused = runCli(intro.repo, ['--base', intro.baseSha, ...extra]);
      assert.equal(refused.code, 2, `${id} ${extra.join(' ')}`);
      assert.match(refused.report.errors[0], new RegExp(`unknown check ${id}`, 'u'));
    }
  }
});
