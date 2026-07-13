import assert from 'node:assert/strict';
import test from 'node:test';

import { createSignedReceiptVerifier } from '../public/src/data/receipt-signature-verifier.mjs';
import { buildReceipt } from '../public/src/state/receipt-builder.mjs';
import { createReceiptService } from '../server/receipts/receipt-service.mjs';
import { signReceipt } from '../server/receipts/receipt-signature.mjs';
import { createTestReceiptKeyring } from './receipt-key-fixtures.mjs';
import { receiptInput, submittedAt } from './state-fixtures.mjs';

test('browser verifier refreshes public keys once after signing-key rotation', async () => {
  const oldRing = await createTestReceiptKeyring('rec_old_01');
  const nextRing = await createTestReceiptKeyring('rec_next_01');
  const unsigned = await buildReceipt({ ...receiptInput, submittedAt });
  const receipt = await signReceipt(unsigned, nextRing);
  const bundles = [
    createReceiptService({ keyring: oldRing }).trustedKeys(),
    createReceiptService({ keyring: nextRing }).trustedKeys(),
  ];
  let calls = 0;
  const verify = createSignedReceiptVerifier(async () => bundles[Math.min(calls++, 1)]);
  assert.deepEqual(await verify(receipt), { ok: true, value: receipt });
  assert.equal(calls, 2);
});
