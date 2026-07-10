import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRoute, parseRoute } from '../public/src/router.mjs';

test('parses every supported route', () => {
  assert.deepEqual(parseRoute('#/'), { name: 'inbox' });
  assert.deepEqual(parseRoute('#/review/assign_a/item_a'), {
    name: 'workspace',
    assignmentId: 'assign_a',
    itemId: 'item_a',
  });
  assert.deepEqual(parseRoute('#/review/assign_a/validate'), {
    name: 'validation',
    assignmentId: 'assign_a',
  });
  assert.deepEqual(parseRoute('#/receipt/rec_abc'), { name: 'receipt', receiptId: 'rec_abc' });
});

test('formats supported routes deterministically', () => {
  assert.equal(formatRoute({ name: 'inbox' }), '#/');
  assert.equal(
    formatRoute({ name: 'workspace', assignmentId: 'assign_a', itemId: 'item_a' }),
    '#/review/assign_a/item_a'
  );
  assert.equal(
    formatRoute({ name: 'validation', assignmentId: 'assign_a' }),
    '#/review/assign_a/validate'
  );
  assert.equal(formatRoute({ name: 'receipt', receiptId: 'rec_abc' }), '#/receipt/rec_abc');
});

test('falls back to inbox for malformed, unknown, or injectable routes', () => {
  for (const hash of [
    '#/unknown',
    '#/review/a/%E0%A4%A',
    '#/review/a/item/extra',
    '#/review/a/%2Freceipt%2Fx',
  ]) {
    assert.deepEqual(parseRoute(hash), { name: 'inbox' });
  }
  assert.equal(formatRoute({ name: 'receipt', receiptId: '../admin' }), '#/');
});
