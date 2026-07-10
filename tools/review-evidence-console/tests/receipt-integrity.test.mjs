import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReceipt, verifyReceipt } from '../public/src/state/receipt-builder.mjs';
import { createReceiptStore } from '../public/src/state/receipt-store.mjs';
import { makeStorage, receiptInput, submittedAt, withReceiptId } from './state-fixtures.mjs';

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
