import assert from 'node:assert/strict';
import test from 'node:test';

import { setDocument } from '../public/src/components/dom.mjs';
import { buildReceipt, verifyReceipt } from '../public/src/state/receipt-builder.mjs';
import { createReceiptStore } from '../public/src/state/receipt-store.mjs';
import { renderWorkspace } from '../public/src/views/workspace.mjs';
import { copy, fakeDocument, walk } from './fake-dom.mjs';
import { bundle } from './review-session-fixtures.mjs';
import { makeStorage, receiptInput, submittedAt, withReceiptId } from './state-fixtures.mjs';

const forbidden = ['suggestionVersion', 'suggestedReview', 'useSessionDateFor'];
const noteText =
  'Disa shënime janë sugjeruar për ta përshpejtuar shqyrtimin; mund t’i ndryshoni ose t’i hiqni.';
const metadata = Object.fromEntries(
  [
    'packetId',
    'packetVersion',
    'assignmentId',
    'reviewerFixtureId',
    'reviewerRole',
    'packetRole',
  ].map(key => [key, receiptInput[key]])
);

function workspaceState() {
  const decision = {
    decision: null,
    concreteAnswer: 'Sugjerim',
    reason: 'Sugjerim',
    evidenceRef: 'docs/suggestion.md',
    verifiedAt: '2026-07-10',
    riskCategory: 'privacy',
    severity: 'high',
    requestedChange: '',
    responses: {},
  };
  return {
    activeItem: 'item_a',
    decisions: { item_a: decision, item_b: structuredClone(decision) },
  };
}

setDocument(fakeDocument);

test('shows one suggestion note before unchecked reviewer controls', () => {
  const view = renderWorkspace({ bundle, state: workspaceState(), safeEvidenceConfirmed: false });
  const nodes = walk(view);
  const notes = nodes.filter(node => node.attributes.role === 'note');
  const formIndex = nodes.findIndex(node => node.attributes.class === 'decision-form');
  assert.equal(notes.length, 1);
  assert.equal(copy(notes[0]).trim(), noteText);
  assert.ok(nodes.indexOf(notes[0]) < formIndex);
  assert.ok(nodes.filter(node => node.attributes.type === 'radio').every(node => !node.checked));
  assert.equal(nodes.find(node => node.attributes.id === 'safe-evidence-confirmed').checked, false);
});

test('canonical receipt builder omits suggestion-only input metadata', async () => {
  const receipt = await buildReceipt({
    ...receiptInput,
    submittedAt,
    suggestionVersion: 1,
    suggestedReview: { reason: 'draft only' },
    useSessionDateFor: ['verifiedAt'],
  });
  for (const key of forbidden) assert.equal(Object.hasOwn(receipt, key), false);
});

test('rejects rehashed suggestion metadata across verification and acceptance paths', async () => {
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  for (const key of forbidden) {
    const malformed = await withReceiptId({
      ...receipt,
      [key]: key === 'suggestionVersion' ? 1 : {},
    });
    assert.equal((await verifyReceipt(malformed)).code, 'invalid_data', `${key}: verify`);
    const storage = makeStorage();
    const store = createReceiptStore({ storage, verifyReceipt, schemaVersion: 1 });
    assert.equal((await store.save(malformed)).code, 'invalid_data', `${key}: save`);
    assert.equal(
      (await store.import(JSON.stringify(malformed), metadata)).code,
      'invalid_data',
      `${key}: import`
    );
    storage.setItem(`review-console:v2:receipt:${malformed.receiptId}`, JSON.stringify(malformed));
    assert.equal((await store.load(malformed.receiptId)).code, 'invalid_data', `${key}: load`);
    await assert.rejects(
      () =>
        buildReceipt({
          ...receiptInput,
          previousReceipt: malformed,
          correctionItemId: 'item_a',
          correctionReason: 'Final reviewer correction.',
          correctionImpact: 'Keeps suggestion metadata out.',
        }),
      /previous receipt/i,
      `${key}: correction`
    );
  }
});
