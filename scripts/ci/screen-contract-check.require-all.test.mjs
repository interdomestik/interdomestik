// `--require-all-enforcing` (the WP-05 flip, D-6, r1-B1, r2-B7): the pinned required workflow's run
// is an error unless every check of the scanner has a current result, enforced, with its head
// settings in `fail` mode and an evaluator digest. Two report-mode baselines therefore fail the job
// instead of passing on zero selected checks, and a head that lowers or drops a check cannot pass.
import assert from 'node:assert/strict';
import test from 'node:test';

import { CHECKS, REQUIRED_CHECKS } from './screen-contract/evaluate.mjs';
import { parseArgs } from './screen-contract-check.mjs';
import {
  BASELINE,
  LEGACY,
  adopted,
  asText,
  baselineData,
  baselineOf,
  owner,
  scan,
} from './fixtures/screen-contract-check/cli-fixtures.mjs';
import { commit } from './fixtures/screen-contract-check/harness.mjs';

const ITEMS = { 'CHK-15c': [LEGACY] };
const FLAGS = ['--enforcing', '--require-all-enforcing'];
function pair(t, baseBaseline, headBaseline) {
  const { root, base } = adopted(t, baseBaseline);
  const head = commit(root, { [BASELINE]: headBaseline, 'notes.md': 'pair\n' });
  return scan(t, root, [...FLAGS, '--base', base, '--head', head]);
}
const allFail = baselineOf(ITEMS, { mode: 'fail' });
const errorsOf = result => result.report.errors.join('\n');

test('D-6: --require-all-enforcing needs --enforcing', () => {
  assert.throws(
    () => parseArgs(['--require-all-enforcing', '--base', 'a']),
    /--require-all-enforcing needs --enforcing/u
  );
  assert.equal(parseArgs([...FLAGS, '--base', 'a']).requireAllEnforcing, true);
});

test('D-6: two report-mode baselines are an error naming every check, not a pass on zero checks', t => {
  const result = pair(t, baselineOf(ITEMS), baselineOf(ITEMS));
  assert.equal(result.code, 2);
  for (const { id } of CHECKS) assert.match(errorsOf(result), new RegExp(`${id} `, 'u'));
});

test('D-6: a head that flips all six passes; one left in report mode is an error', t => {
  const flipped = pair(t, baselineOf(ITEMS), allFail);
  assert.equal(flipped.code, 0, errorsOf(flipped));
  for (const { id } of CHECKS) {
    assert.equal(flipped.report.checks[id].enforcing, true);
    assert.match(flipped.report.checks[id].digest, /^[0-9a-f]{64}$/u);
  }
  const partial = pair(
    t,
    baselineOf(ITEMS),
    baselineOf(ITEMS, { mode: { ...modes(), 'CHK-09': 'report' } })
  );
  assert.equal(partial.code, 2);
  assert.match(errorsOf(partial), /--require-all-enforcing: CHK-09 has no result/u);
});

test('D-6: a base that enforces all six and a head that lowers one is an error, not only tamper', t => {
  const lowered = pair(t, allFail, baselineOf(ITEMS, { mode: { ...modes(), A11Y: 'report' } }));
  assert.equal(lowered.code, 2);
  assert.match(errorsOf(lowered), /A11Y is not enforced with fail-mode head settings/u);
});

function modes() {
  return Object.fromEntries(CHECKS.map(({ id }) => [id, 'fail']));
}

test('D-6: an authorized #check removal of a required check is an error naming it (r3 hardening)', t => {
  const data = baselineData(ITEMS, {
    mode: 'fail',
    exceptions: [owner('CHK-09', '#check', 'downgrade')],
  });
  delete data.checks['CHK-09'];
  const removed = pair(t, allFail, asText(data));
  assert.equal(removed.code, 2);
  assert.match(errorsOf(removed), /--require-all-enforcing: CHK-09 /u);
});

test('D-6: the required set is the fixed six, not the scanner catalogue (r3-B5)', () => {
  assert.deepEqual([...REQUIRED_CHECKS].sort(), [
    'A11Y',
    'CHK-09',
    'CHK-15a',
    'CHK-15b',
    'CHK-15c',
    'CHK-22',
  ]);
  // Today the catalogue holds the same six; a scanner that retires one cannot shrink the list.
  assert.deepEqual(CHECKS.map(c => c.id).sort(), [...REQUIRED_CHECKS].sort());
});
