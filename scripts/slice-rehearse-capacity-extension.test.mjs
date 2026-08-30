import assert from 'node:assert/strict';
import test from 'node:test';

import { extendBoundedAllocation } from './slice-rehearse-capacity-extension.mjs';

test('explicit governance extension preserves existing owner paths and adds only real headroom', () => {
  const existing = {
    id: 'harness-v2-efficiency',
    mode: 'bounded',
    writerPaths: ['package.json', 'scripts/existing.mjs'],
    maxTrackedBytesDelta: 300,
    maxTrackedFilesDelta: 1,
    maxCategoryBytesDelta: { 'config/data/messages': 100, 'source/scripts': 200 },
    maxPathBytesDelta: { 'package.json': 100, 'scripts/existing.mjs': 200 },
  };
  const proposed = {
    id: 'harness-v2-efficiency',
    mode: 'bounded',
    writerPaths: ['package.json', 'scripts/new.mjs', 'scripts/new.test.mjs'],
    maxTrackedBytesDelta: 350,
    maxTrackedFilesDelta: 2,
    maxCategoryBytesDelta: { 'config/data/messages': 150, 'source/scripts': 80, 'tests/e2e': 120 },
    maxPathBytesDelta: { 'package.json': 150, 'scripts/new.mjs': 80, 'scripts/new.test.mjs': 120 },
  };
  const extended = extendBoundedAllocation(
    existing,
    proposed,
    {
      'package.json': 'config/data/messages',
      'scripts/new.mjs': 'source/scripts',
      'scripts/new.test.mjs': 'tests/e2e',
    },
    {
      'scripts/new.mjs': { capacityBaselineExists: false },
      'scripts/new.test.mjs': { capacityBaselineExists: false },
    }
  );
  assert.deepEqual(extended.writerPaths, [
    'package.json',
    'scripts/existing.mjs',
    'scripts/new.mjs',
    'scripts/new.test.mjs',
  ]);
  assert.equal(extended.maxTrackedBytesDelta, 550);
  assert.equal(extended.maxTrackedFilesDelta, 3);
  assert.deepEqual(extended.maxCategoryBytesDelta, {
    'config/data/messages': 150,
    'source/scripts': 280,
    'tests/e2e': 120,
  });
});

test('capacity extension rejects a different or non-bounded owner identity', () => {
  const existing = { id: 'one', mode: 'bounded' };
  assert.throws(
    () => extendBoundedAllocation(existing, { id: 'two', mode: 'bounded' }, {}),
    /one bounded identity/u
  );
});

test('capacity extension fails closed when a writer category is missing', () => {
  const existing = {
    id: 'owner',
    mode: 'bounded',
    writerPaths: [],
    maxTrackedBytesDelta: 0,
    maxTrackedFilesDelta: 0,
    maxCategoryBytesDelta: {},
    maxPathBytesDelta: {},
  };
  const proposed = {
    id: 'owner',
    mode: 'bounded',
    writerPaths: ['scripts/new.mjs'],
    maxPathBytesDelta: { 'scripts/new.mjs': 10 },
  };
  assert.throws(() => extendBoundedAllocation(existing, proposed, {}), /category.*missing/u);
});
