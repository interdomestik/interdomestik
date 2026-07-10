import assert from 'node:assert/strict';
import test from 'node:test';
import { createReviewSession } from '../public/src/state/review-session.mjs';
import { bundle } from './review-session-fixtures.mjs';

test('rejects duplicate packet item IDs before decisions can collapse', () => {
  const packet = structuredClone(bundle.packet);
  packet.itemIds = ['item_a', 'item_a'];
  packet.items = [packet.items[0], structuredClone(packet.items[0])];
  assert.throws(() => createReviewSession({ ...bundle, packet }), /item identities/i);
});

test('rejects duplicate item object IDs even with distinct ordered IDs', () => {
  const packet = structuredClone(bundle.packet);
  packet.items[1].id = packet.items[0].id;
  assert.throws(() => createReviewSession({ ...bundle, packet }), /item identities/i);
});
