import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RECEIPT_SIGNATURE_DOMAIN,
  canonicalReceiptBytes,
} from '../server/receipts/canonical-json.mjs';

test('receipt signing bytes use the exact domain prefix and canonical JSON', () => {
  const bytes = canonicalReceiptBytes({ z: 'Shqyrtim', a: ['ë', { b: true, a: 1 }] });
  const expected = `${RECEIPT_SIGNATURE_DOMAIN}{"a":["ë",{"a":1,"b":true}],"z":"Shqyrtim"}`;
  assert.equal(new TextDecoder().decode(bytes), expected);
  assert.equal(RECEIPT_SIGNATURE_DOMAIN, 'REC02-RECEIPT-SIGNATURE-V1\0');
});

test('receipt canonicalization rejects undefined and non-finite values', () => {
  for (const value of [{ a: undefined }, { a: Number.NaN }, { a: Number.POSITIVE_INFINITY }]) {
    assert.throws(() => canonicalReceiptBytes(value));
  }
});
