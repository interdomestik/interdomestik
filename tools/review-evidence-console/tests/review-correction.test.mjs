import assert from 'node:assert/strict';
import test from 'node:test';
import { createReviewSession } from '../public/src/state/review-session.mjs';
import { setDocument } from '../public/src/components/dom.mjs';
import { renderCorrection } from '../public/src/views/correction.mjs';
import { bundle, completeDecision, priorReceipt } from './review-session-fixtures.mjs';
import { copy, fakeDocument } from './fake-dom.mjs';

setDocument(fakeDocument);

const metadata = {
  itemId: 'item_a',
  reason: 'Clarify the boundary.',
  impact: 'Improves auditability.',
};

test('restores every complete receipt decision and structured response', async () => {
  let dateCalls = 0;
  const session = createReviewSession(bundle, undefined, {
    applySuggestions: false,
    getLocalDate: () => (++dateCalls, '2026-07-10'),
  });
  const snapshot = await session.createCorrection(await priorReceipt(), metadata);
  assert.equal(dateCalls, 0);
  assert.equal(snapshot.suggestionVersion, 1);
  assert.equal(snapshot.decisions.item_a.decision, 'approve');
  assert.equal(snapshot.decisions.item_b.reason, completeDecision.reason);
  assert.equal(snapshot.decisions.item_a.responses.ownerRole, 'Privacy lead');
  assert.equal(snapshot.decisions.item_b.responses.ownerRole, 'Privacy lead');
  assert.equal(snapshot.correction.previousReceipt.receiptId, 'rec_27c9edce5f66ca4faa44799b');
  assert.equal(snapshot.correction.previousReceipt.decisions.item_a.decision, 'approve');
  assert.equal(snapshot.correction.itemId, 'item_a');
});

test('rejects missing or extra decision item keys', async () => {
  const missing = await priorReceipt({ decisions: { item_a: completeDecision } });
  const extra = await priorReceipt({
    decisions: { item_a: completeDecision, item_b: completeDecision, extra: completeDecision },
    structuredResponses: {
      item_a: completeDecision.responses,
      item_b: completeDecision.responses,
      extra: completeDecision.responses,
    },
  });
  await assert.rejects(
    () => createReviewSession(bundle).createCorrection(missing, metadata),
    /receipt/i
  );
  await assert.rejects(
    () => createReviewSession(bundle).createCorrection(extra, metadata),
    /receipt/i
  );
});

test('rejects missing or extra structured response item keys', async () => {
  const missing = await priorReceipt({
    structuredResponses: { item_a: completeDecision.responses },
  });
  const extra = await priorReceipt({
    structuredResponses: {
      item_a: completeDecision.responses,
      item_b: completeDecision.responses,
      extra: completeDecision.responses,
    },
  });
  await assert.rejects(
    () => createReviewSession(bundle).createCorrection(missing, metadata),
    /receipt/i
  );
  await assert.rejects(
    () => createReviewSession(bundle).createCorrection(extra, metadata),
    /receipt/i
  );
});

test('rejects incomplete base and descriptor fields in a hash-valid receipt', async () => {
  const missingBase = await priorReceipt({
    decisions: { item_a: completeDecision, item_b: { ...completeDecision, reason: '' } },
  });
  const missingResponse = await priorReceipt({
    structuredResponses: { item_a: completeDecision.responses, item_b: {} },
  });
  await assert.rejects(
    () => createReviewSession(bundle).createCorrection(missingBase, metadata),
    /receipt/i
  );
  await assert.rejects(
    () => createReviewSession(bundle).createCorrection(missingResponse, metadata),
    /receipt/i
  );
});

test('snapshots the caller receipt before asynchronous verification', async () => {
  const receipt = structuredClone(await priorReceipt());
  const pending = createReviewSession(bundle).createCorrection(receipt, metadata);
  receipt.assignmentId = 'mutated_assignment';
  receipt.decisions.item_a.reason = 'Mutated caller reason.';
  receipt.structuredResponses.item_a.ownerRole = 'Mutated caller role';

  const snapshot = await pending;
  assert.equal(snapshot.correction.previousReceipt.assignmentId, 'assign_a');
  assert.equal(snapshot.decisions.item_a.reason, completeDecision.reason);
  assert.equal(snapshot.decisions.item_a.responses.ownerRole, 'Privacy lead');
});

test('rejects blank correction reason and impact', async () => {
  const receipt = await priorReceipt();
  await assert.rejects(
    () =>
      createReviewSession(bundle).createCorrection(receipt, {
        itemId: 'item_a',
        reason: '   ',
        impact: 'Impact.',
      }),
    /required/i
  );
});

test('renders the correction workflow in Albanian', async () => {
  const receipt = await priorReceipt();
  const node = renderCorrection({
    receipt,
    itemIds: ['item_a'],
    values: { itemId: '', reason: '', impact: '' },
    onChange() {},
    onSubmit() {},
  });
  const content = copy(node);
  assert.match(content, /Krijo një korrigjim/);
  assert.match(content, /Vërtetimi i mëparshëm .* mbetet i pandryshueshëm/);
  assert.match(content, /Hap hapësirën e korrigjimit/);
});
