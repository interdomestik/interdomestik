import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeOwnedGraphs } from './db-access-graph-workers.mjs';

test('complete worker merge retains large failure sets without variadic argument limits', () => {
  const first = Array.from({ length: 160000 }, (_, index) => ({
    identity: 'first-' + index,
    mountedFrom: 'first.ts',
  }));
  const second = Array.from({ length: 40000 }, (_, index) => ({
    identity: 'second-' + index,
    mountedFrom: 'second.ts',
  }));
  const prepared = {
    inventory: { changed: new Set(['first.ts', 'second.ts']) },
    provenance: { environmentChanges: new Set(), analysisUnknown: new Set(['initial']) },
  };
  const merged = mergeOwnedGraphs(
    prepared,
    [['first.ts'], ['second.ts']],
    [
      {
        origins: ['first.ts'],
        failures: first,
        incomplete: [{ file: 'first.ts', reason: 'unresolved edge', occurrences: 3 }],
        incompleteRawCount: 3,
        reachedTestSources: ['one.test.ts', 'shared.test.ts'],
      },
      {
        origins: ['second.ts'],
        failures: second,
        incomplete: [{ file: 'second.ts', reason: 'unresolved edge', occurrences: 4 }],
        incompleteRawCount: 4,
        reachedTestSources: ['shared.test.ts', 'two.test.ts'],
      },
    ]
  );
  assert.deepEqual(merged.failures, first.concat(second));
  assert.deepEqual(merged.incomplete, [
    { file: '<analysis>', reason: 'initial', occurrences: 1 },
    { file: 'first.ts', reason: 'unresolved edge', occurrences: 3 },
    { file: 'second.ts', reason: 'unresolved edge', occurrences: 4 },
  ]);
  assert.equal(merged.incompleteRawCount, 8);
  assert.deepEqual(
    [...merged.reachedTestSources],
    ['one.test.ts', 'shared.test.ts', 'two.test.ts']
  );
});
