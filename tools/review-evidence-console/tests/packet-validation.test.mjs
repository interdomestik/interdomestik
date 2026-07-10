import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePacket } from '../public/src/validation/packet.mjs';
import { baseItem, completeDecision } from './validation-fixtures.mjs';

test('returns item validation in packet order', () => {
  const result = validatePacket(
    { items: [{ ...baseItem, id: 'first' }, { ...baseItem, id: 'second' }] },
    {},
    true
  );
  assert.deepEqual(result.items.map(entry => entry.itemId), ['first', 'second']);
});

test('groups the exact missing-field count', () => {
  const result = validatePacket({ items: [baseItem] }, { item: {} }, true);
  assert.equal(result.valid, false);
  assert.equal(result.errorCount, 7);
});

test('validates packet-level repo-safe evidence acknowledgement', () => {
  const result = validatePacket({ items: [baseItem] }, { item: completeDecision() }, false);
  assert.equal(result.errors.some(error => error.key === 'safeEvidenceConfirmed'), true);
});

test('fails closed when the safety acknowledgement is omitted', () => {
  const result = validatePacket({ items: [baseItem] }, { item: completeDecision() });
  assert.equal(result.errors.some(error => error.key === 'safeEvidenceConfirmed'), true);
});
