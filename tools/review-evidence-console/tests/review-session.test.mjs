import assert from 'node:assert/strict';
import test from 'node:test';
import { createReviewSession } from '../public/src/state/review-session.mjs';
import { bundle, completeDecision, priorReceipt } from './review-session-fixtures.mjs';

test('initializes every item with an explicit null decision', () => {
  const snapshot = createReviewSession(bundle).getSnapshot();
  assert.equal(snapshot.activeItem, 'item_a');
  assert.equal(snapshot.decisions.item_a.decision, null);
  assert.equal(snapshot.decisions.item_b.decision, null);
});

test('returns new deeply frozen snapshots while preserving earlier snapshots', () => {
  const session = createReviewSession(bundle);
  const before = session.getSnapshot();
  const after = session.setField('item_a', 'reason', 'Repo-safe reason.');
  assert.notEqual(after, before);
  assert.equal(before.decisions.item_a.reason, 'The fixture authority supports this boundary.');
  assert.equal(Object.isFrozen(after.decisions.item_a), true);
  assert.throws(() => {
    after.decisions.item_a.reason = 'mutation';
  });
});

test('calls onChange once for real changes and never for no-ops', () => {
  let calls = 0;
  const session = createReviewSession(bundle, undefined, {
    onChange: () => {
      calls += 1;
    },
  });
  session.selectItem('item_a');
  session.setDecision('item_a', null);
  session.setDecision('item_a', 'approve');
  session.setDecision('item_a', 'approve');
  assert.equal(calls, 1);
});

test('rejects unknown items and fields without changing state', () => {
  const session = createReviewSession(bundle);
  const before = session.getSnapshot();
  assert.throws(() => session.selectItem('unknown'), /item/i);
  assert.throws(() => session.setField('item_a', 'notAField', 'x'), /field/i);
  assert.throws(() => session.setResponse('unknown', 'ownerRole', 'x'), /item/i);
  assert.equal(session.getSnapshot(), before);
});

test('rejects invalid decisions and unknown structured response keys', () => {
  const session = createReviewSession(bundle);
  assert.throws(() => session.setDecision('item_a', 'maybe'), /decision/i);
  assert.throws(() => session.setResponse('item_a', 'unknown', 'x'), /response/i);
});

test('preserves structured response values without aliasing caller data', () => {
  const session = createReviewSession(bundle);
  const value = ['privacy', 'legal'];
  const snapshot = session.setResponse('item_a', 'ownerRole', value);
  value.push('changed');
  assert.deepEqual(snapshot.decisions.item_a.responses.ownerRole, ['privacy', 'legal']);
});

test('uses guidance as prose without selecting a decision or completing the item', () => {
  const session = createReviewSession(bundle);
  const snapshot = session.useGuidance('item_a');
  assert.equal(snapshot.decisions.item_a.decision, null);
  assert.equal(snapshot.decisions.item_a.concreteAnswer, bundle.packet.items[0].guidance);
  assert.equal(snapshot.decisions.item_a.reason, bundle.packet.items[0].guidance);
  assert.equal(session.validate(true).valid, false);
});

test('integrates packet validation for complete decisions and safety confirmation', () => {
  const session = createReviewSession(bundle);
  for (const id of bundle.packet.itemIds) {
    session.setDecision(id, completeDecision.decision);
    for (const [key, value] of Object.entries(completeDecision)) {
      if (!['decision', 'responses'].includes(key)) session.setField(id, key, value);
    }
    session.setResponse(id, 'ownerRole', 'Privacy lead');
  }
  assert.equal(session.validate(false).valid, false);
  assert.equal(session.validate(true).valid, true);
});

test('restores a draft without aliasing it or inventing missing item decisions', () => {
  const originalReason = completeDecision.reason;
  const draft = {
    activeItem: 'item_b',
    itemDecisions: { item_a: structuredClone(completeDecision) },
  };
  const session = createReviewSession(bundle, draft);
  draft.itemDecisions.item_a.reason = 'changed outside';
  const snapshot = session.getSnapshot();
  assert.equal(snapshot.activeItem, 'item_b');
  assert.equal(snapshot.decisions.item_a.reason, originalReason);
  assert.equal(snapshot.decisions.item_b.decision, null);
});

test('creates correction state only from a valid prior receipt and required metadata', async () => {
  const receipt = await priorReceipt();
  const session = createReviewSession(bundle);
  const snapshot = await session.createCorrection(receipt, {
    itemId: 'item_a',
    reason: 'Clarify the boundary.',
    impact: 'Improves auditability.',
  });
  assert.equal(snapshot.correction.previousReceipt.receiptId, receipt.receiptId);
  assert.equal(snapshot.correction.itemId, 'item_a');
  assert.equal(snapshot.decisions.item_a.decision, 'approve');
  assert.equal(snapshot.decisions.item_a.responses.ownerRole, 'Privacy lead');
  assert.equal(Object.isFrozen(snapshot.correction.previousReceipt), true);
  await assert.rejects(
    () => session.createCorrection(receipt, { itemId: 'item_a' }),
    /correction/i
  );
});

test('rejects correction receipts with mismatched identity or corrupted content', async () => {
  const receipt = await priorReceipt();
  const session = createReviewSession(bundle);
  const wrong = { ...receipt, assignmentId: 'other' };
  await assert.rejects(
    () =>
      session.createCorrection(wrong, {
        itemId: 'item_a',
        reason: 'Clarify.',
        impact: 'Auditability.',
      }),
    /receipt/i
  );
});
