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
