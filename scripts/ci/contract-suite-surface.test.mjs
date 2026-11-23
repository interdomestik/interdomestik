import assert from 'node:assert/strict';
import test from 'node:test';

import { selectContractSuite } from './contract-suite-surface.mjs';

const baseSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const records = (...fields) => [...fields, ''].join('\0');
const changed = (...files) => records(...files.flatMap(file => ['M', file]));
const ready = {
  eventName: 'pull_request',
  baseSha,
  headSha,
  draft: false,
  parents: [baseSha, headSha],
  prDiff: changed('apps/web/src/a.ts', 'packages/test.ts', 'docs/guide.md'),
  testedDiff: changed('apps/web/src/a.ts'),
  baseHasRoots: true,
  testedHasRoots: true,
};
const full = (reason, firstPathOutside = null) => ({ lane: 'full', reason, firstPathOutside });
const product = { lane: 'product', reason: 'product-paths-only', firstPathOutside: null };
const select = overrides => selectContractSuite({ ...ready, ...overrides });

test('ready PRs qualify when both diffs stay within the three product roots', () => {
  assert.deepEqual(select(), product);
  assert.deepEqual(
    select({ prDiff: changed('docs/guide.md'), testedDiff: changed('docs/guide.md') }),
    product
  );
});

test('non-PR events and missing or invalid event SHAs choose full', () => {
  assert.deepEqual(selectContractSuite(), full('non-pull-request'));
  assert.deepEqual(selectContractSuite(null), full('non-pull-request'));
  for (const eventName of [
    undefined,
    '',
    'push',
    'schedule',
    'workflow_dispatch',
    'pull_request_target',
  ]) {
    assert.deepEqual(select({ eventName }), full('non-pull-request'));
  }
  for (const key of ['baseSha', 'headSha']) {
    for (const sha of [undefined, '', 'a'.repeat(39), 'g'.repeat(40), `${baseSha}\n`, '--help']) {
      assert.deepEqual(select({ [key]: sha }), full('invalid-event-sha'));
    }
  }
});

test('merge parent evidence must be exactly the event base and head in order', () => {
  for (const parents of [
    undefined,
    [],
    [baseSha],
    [headSha, baseSha],
    [baseSha, 'c'.repeat(40)],
    [baseSha, headSha, baseSha],
  ]) {
    assert.deepEqual(select({ parents }), full('merge-parents-mismatch'));
  }
});

test('both diffs reject missing, empty, malformed, truncated and pathless records', () => {
  const invalid = {
    missing: undefined,
    empty: '',
    unparseable: 'M\tapps/web/src/a.ts\n',
    'unknown status': records('Z', 'apps/a'),
    'empty status': records('', 'apps/a'),
    'empty path': records('M', ''),
    'directory path': records('M', 'apps/'),
    'dot segment': records('M', 'apps/../tools/a'),
    'NUL only': '\0',
    'missing delimiter': 'M\0apps/a',
    'missing path field': records('M', 'apps/a', 'D'),
    'extra field': records('M', 'apps/a', 'apps/b'),
    'rename record': records('R100', 'tools/a', 'apps/a'),
    'copy record': records('C100', 'tools/a', 'apps/a'),
  };
  for (const [name, raw] of Object.entries(invalid)) {
    assert.deepEqual(select({ prDiff: raw }), full('invalid-pr-diff'), name);
    assert.deepEqual(select({ testedDiff: raw }), full('invalid-tested-tree-diff'), name);
  }
});

test('paths are compared byte by byte and the first outside path is preserved', () => {
  for (const file of [
    'Apps/a',
    'packages-other/a',
    ' docs/a',
    'docs',
    'apps\\a',
    'tools/a\n\t\x1b\xff',
  ]) {
    const expected = full('path-outside-product-roots', file);
    assert.deepEqual(select({ prDiff: changed('apps/a', file, 'tools/b') }), expected);
    assert.deepEqual(select({ testedDiff: changed(file, 'tools/b') }), expected);
  }
  assert.deepEqual(select({ prDiff: changed('docs/\xff\n\t\x1b file') }), product);
});

test('invalid evidence takes precedence in design order', () => {
  assert.deepEqual(select({ eventName: 'push', baseSha: '' }), full('non-pull-request'));
  assert.deepEqual(select({ parents: [], prDiff: '' }), full('merge-parents-mismatch'));
  assert.deepEqual(
    select({ prDiff: changed('tools/a'), testedDiff: '' }),
    full('invalid-tested-tree-diff')
  );
  assert.deepEqual(
    select({ testedDiff: changed('tools/a'), baseHasRoots: false }),
    full('path-outside-product-roots', 'tools/a')
  );
  assert.deepEqual(select({ testedHasRoots: false, draft: true }), full('missing-root-tree'));
});

test('root-tree presence and an explicit ready flag are required', () => {
  for (const key of ['baseHasRoots', 'testedHasRoots']) {
    for (const value of [undefined, false, 'true']) {
      assert.deepEqual(select({ [key]: value }), full('missing-root-tree'));
    }
  }
  assert.deepEqual(select({ draft: true }), full('draft-pr'));
  for (const draft of [undefined, '', 'false', 0]) {
    assert.deepEqual(select({ draft }), full('invalid-draft-flag'));
  }
});
