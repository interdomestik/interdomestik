import assert from 'node:assert/strict';
import test from 'node:test';

import { createSeededRandom } from '../src/seed-utils/seeded-random';

const draw = (seed: number, count: number) => {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => random());
};

test('a seed always yields the same sequence', () => {
  assert.deepEqual(draw(0x6b_73_20_26, 32), draw(0x6b_73_20_26, 32));
});

test('different seeds yield different sequences in [0, 1)', () => {
  const first = draw(1, 32);
  assert.notDeepEqual(first, draw(2, 32));
  assert.ok(first.every(value => value >= 0 && value < 1));
});
