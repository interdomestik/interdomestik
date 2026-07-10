import assert from 'node:assert/strict';
import test from 'node:test';
import { readReceiptFile, exportReceipt } from '../public/src/app/receipt-io.mjs';

test('rejects non-json and oversized files before reading text', async () => {
  let reads = 0;
  assert.equal(
    (await readReceiptFile({ name: 'receipt.txt', size: 1, text: async () => ++reads })).code,
    'file_type'
  );
  assert.equal(
    (await readReceiptFile({ name: 'RECEIPT.JSON', size: 1_048_577, text: async () => ++reads }))
      .code,
    'file_size'
  );
  assert.equal(reads, 0);
});

test('returns stable read and clipboard failures', async () => {
  assert.equal(
    (
      await readReceiptFile({
        name: 'receipt.json',
        size: 1,
        text: async () => {
          throw new Error('private');
        },
      })
    ).message,
    'Skedari i vërtetimit nuk mund të lexohej.'
  );
  const result = await exportReceipt(
    'rec_abc',
    { export: async () => ({ ok: true, value: '{}' }) },
    {
      download: () => {
        throw new Error('blocked');
      },
      clipboard: {
        writeText: async () => {
          throw new Error('private');
        },
      },
    }
  );
  assert.equal(result.code, 'download_failed');
  assert.equal((await result.copy()).message, 'JSON-i i vërtetimit nuk mund të kopjohej.');
  assert.equal(result.text, '{}');
});

test('reads case-insensitive json filenames and returns exact text', async () => {
  const text = '{"receiptId":"rec_test"}';
  assert.deepEqual(
    await readReceiptFile({ name: 'Receipt.JsOn', size: text.length, text: async () => text }),
    { ok: true, value: text }
  );
});
