import assert from 'node:assert/strict';
import test from 'node:test';
import { createReviewSession } from '../public/src/state/review-session.mjs';
import { bundle, priorReceipt } from './review-session-fixtures.mjs';

test('rejects duplicate packet item IDs before decisions can collapse', () => {
  const packet = structuredClone(bundle.packet);
  packet.itemIds = ['item_a', 'item_a'];
  packet.items = [packet.items[0], structuredClone(packet.items[0])];
  assert.throws(() => createReviewSession({ ...bundle, packet }), /itemIds|item identities/i);
});

test('rejects duplicate item object IDs even with distinct ordered IDs', () => {
  const packet = structuredClone(bundle.packet);
  packet.items[1].id = packet.items[0].id;
  assert.throws(() => createReviewSession({ ...bundle, packet }), /itemIds|item identities/i);
});

test('owns normalized bundle data after construction', async () => {
  const caller = structuredClone(bundle);
  const session = createReviewSession(caller);
  caller.assignment.id = 'changed_assignment';
  caller.reviewer.id = 'changed_reviewer';
  caller.packet.id = 'changed_packet';
  caller.packet.itemIds[0] = 'changed_item';
  caller.packet.items[0].id = 'changed_item';
  caller.packet.items[0].guidance = 'Changed caller guidance.';
  caller.packet.items[0].requiredResponses[0].key = 'changedResponse';

  const snapshot = session.useGuidance('item_a');
  assert.equal(snapshot.assignmentId, 'assign_a');
  assert.equal(snapshot.decisions.item_a.concreteAnswer, bundle.packet.items[0].guidance);
  assert.doesNotThrow(() => session.setResponse('item_a', 'ownerRole', 'Privacy lead'));
  assert.throws(() => session.setResponse('item_a', 'changedResponse', 'x'), /response/i);
  assert.equal(session.validate(true).items[0].itemId, 'item_a');
  const corrected = await session.createCorrection(await priorReceipt(), {
    itemId: 'item_a',
    reason: 'Clarify the boundary.',
    impact: 'Improves auditability.',
  });
  assert.equal(corrected.correction.previousReceipt.assignmentId, 'assign_a');
});

test('owns contextual note state restored from a draft', () => {
  const seed = createReviewSession(bundle).getSnapshot();
  const draft = structuredClone(seed);
  const session = createReviewSession(bundle, draft);
  draft.contextualNoteState.item_a.requestedChange.status = 'dismissed';
  assert.deepEqual(session.getSnapshot().contextualNoteState.item_a.requestedChange, {
    status: 'unseen',
  });
});
