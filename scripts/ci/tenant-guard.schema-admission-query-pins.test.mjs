// Reviewed non-client `.query` consumers: admitted only at their pinned path with their exact bytes.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { KERNEL_ANCHOR, NON_CLIENT_QUERY_CONSUMERS } from './tenant-guard/manifest.mjs';
import {
  nonClientQueryPins,
  retainedConsumerProblem,
} from './tenant-guard/rules-schema-consumers.mjs';
import { append, scan, snapshot } from './tenant-guard-schema-test-support.mjs';

const ROOT = new URL('../../', import.meta.url);
const SHAPE = 'apps/web/src/lib/safe-action.shape.ts';
const ROUTE = 'apps/web/src/lib/safe-route.core.ts';
// Each reviewed file at the commit whose bytes were reviewed: the anchor for the action shape,
// the WP-02 1b-2 merge for the route core.
const REVIEWED = [
  { path: SHAPE, commit: KERNEL_ANCHOR.commit, copy: 'apps/web/src/lib/safe-action.shape-copy.ts' },
  {
    path: ROUTE,
    commit: 'bab797bebfa8ce461c7d0c5ea1b7ede282bf59e3',
    copy: 'apps/web/src/lib/safe-route.core-copy.ts',
  },
];
const INVALID = 'invalid non-client query consumer list';
const reviewedBytes = ({ path, commit }) =>
  execFileSync('/usr/bin/git', ['show', `${commit}:${path}`], { cwd: ROOT, encoding: 'utf8' });
const HASH = NON_CLIENT_QUERY_CONSUMERS[0]?.sha256;
const retainedAt = (file, text) =>
  scan(append({ [file]: text }), { base: snapshot({ [file]: text }) }).schemaAdmission;

test('the pinned list names exactly the reviewed shape and route modules', () => {
  assert.deepEqual(
    NON_CLIENT_QUERY_CONSUMERS.map(({ path }) => path),
    [SHAPE, ROUTE]
  );
  assert.ok(Object.isFrozen(NON_CLIENT_QUERY_CONSUMERS));
  assert.ok(NON_CLIENT_QUERY_CONSUMERS.every(entry => Object.isFrozen(entry)));
  assert.ok(nonClientQueryPins(NON_CLIENT_QUERY_CONSUMERS) instanceof Map);
});

for (const entry of REVIEWED) {
  const reviewed = reviewedBytes(entry);

  test(`${entry.path} at its pinned hash is admitted with a tail table`, () => {
    const result = retainedAt(entry.path, reviewed);
    assert.equal(result.ok, true, result.reason);
  });

  test(`${entry.path} with one byte changed refuses the tail table`, () => {
    const result = retainedAt(entry.path, `${reviewed} `);
    assert.equal(result.ok, false);
    assert.equal(result.reason, `candidate: unproven dynamic schema consumer ${entry.path}`);
  });

  test(`an unlisted copy of ${entry.path} refuses the tail table`, () => {
    const result = retainedAt(entry.copy, reviewed);
    assert.equal(result.ok, false);
    assert.equal(result.reason, `candidate: unproven dynamic schema consumer ${entry.copy}`);
  });
}

for (const [name, list] of [
  ['missing', null],
  ['not a list', { [SHAPE]: HASH }],
  ['empty', []],
  ['null entry', [null]],
  ['path not a string', [{ path: 1, sha256: HASH }]],
  ['path outside apps and packages', [{ path: 'scripts/x.ts', sha256: HASH }]],
  ['path with a parent segment', [{ path: 'apps/web/../x.ts', sha256: HASH }]],
  ['short hash', [{ path: SHAPE, sha256: 'abc' }]],
  ['uppercase hash', [{ path: SHAPE, sha256: HASH.toUpperCase() }]],
  ['extra field', [{ path: SHAPE, sha256: HASH, note: 'x' }]],
  ['duplicate path', [{ path: SHAPE, sha256: HASH }, { path: SHAPE, sha256: HASH }]],
]) {
  test(`a ${name} pin list is refused`, () => {
    assert.equal(nonClientQueryPins(list), null);
    const tree = { allSources: new Map() };
    assert.equal(retainedConsumerProblem(tree, tree, tree, new Set(), new Set(), list), INVALID);
  });
}

test('an absent pin list is refused', () => {
  assert.equal(nonClientQueryPins(undefined), null);
});
