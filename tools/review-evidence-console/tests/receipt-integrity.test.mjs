import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReceipt, verifyReceipt } from '../public/src/state/receipt-builder.mjs';
import { canonicalStringify } from '../public/src/state/canonical-json.mjs';
import { createReceiptStore } from '../public/src/state/receipt-store.mjs';
import { makeStorage, receiptInput, submittedAt, withReceiptId } from './state-fixtures.mjs';

test('fixed submission time preserves canonical JSON and receipt identity', async () => {
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  assert.equal(receipt.receiptId, 'rec_fab9fdba45292d2e5a7af416');
  assert.equal(
    canonicalStringify(receipt),
    '{"assignmentId":"assign_a","authorityDisclaimer":"Fixture authority only; no production decision.","decisions":{"item_a":{"decision":"approve","riskCategory":"privacy","severity":"high"}},"packetId":"mob-03a-part-a","packetRole":"privacy","packetVersion":"1","receiptId":"rec_fab9fdba45292d2e5a7af416","receiptVersion":1,"reviewerDisplayName":"Privacy reviewer","reviewerFixtureId":"reviewer_a","reviewerRole":"privacy","riskSummary":{"categories":["privacy"],"severity":"high"},"schemaVersion":1,"structuredResponses":{"item_a":{"ownerRole":"Privacy lead"}},"submittedAt":"2026-07-09T12:00:00.000Z"}'
  );
});

test('correction receipt preserves canonical ancestry and raw enums', async () => {
  const first = await buildReceipt({ ...receiptInput, submittedAt });
  const correction = await buildReceipt({
    ...receiptInput,
    submittedAt: '2026-07-10T12:00:00.000Z',
    previousReceipt: first,
    correctionItemId: 'item_a',
    correctionReason: 'Clarify boundary.',
    correctionImpact: 'Improves auditability.',
  });
  assert.equal(correction.receiptId, 'rec_7f5b9e2189cae9418dab76d5');
  assert.equal(correction.previousReceiptId, first.receiptId);
  assert.equal(correction.receiptVersion, 2);
  assert.equal(correction.decisions.item_a.decision, 'approve');
});

test('rejects a valid but unrelated previous receipt', async () => {
  const fields = [
    'schemaVersion',
    'packetId',
    'packetVersion',
    'assignmentId',
    'reviewerFixtureId',
    'reviewerRole',
    'packetRole',
    'reviewerDisplayName',
    'authorityDisclaimer',
  ];
  for (const field of fields) {
    const value = field === 'schemaVersion' ? 2 : `unrelated_${field}`;
    const previousReceipt = await buildReceipt({ ...receiptInput, [field]: value, submittedAt });
    await assert.rejects(
      () =>
        buildReceipt({
          ...receiptInput,
          previousReceipt,
          correctionItemId: 'item_a',
          correctionReason: 'Clarify evidence boundary.',
          correctionImpact: 'Improves auditability.',
        }),
      /previous receipt/i
    );
  }
});

test('rejects a self-hashed false risk summary without storage mutation', async () => {
  const storage = makeStorage();
  const store = createReceiptStore({ storage, verifyReceipt, schemaVersion: 1 });
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  const malformed = await withReceiptId({
    ...structuredClone(receipt),
    riskSummary: { severity: 'low', categories: ['other'] },
  });
  const metadata = {
    packetId: receipt.packetId,
    packetVersion: receipt.packetVersion,
    assignmentId: receipt.assignmentId,
    reviewerFixtureId: receipt.reviewerFixtureId,
    reviewerRole: receipt.reviewerRole,
    packetRole: receipt.packetRole,
  };
  assert.equal((await store.import(JSON.stringify(malformed), metadata)).code, 'invalid_data');
  assert.equal(storage.length, 0);
});
