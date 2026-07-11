import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalStringify } from '../public/src/state/canonical-json.mjs';
import { createReceiptDirectoryWriter } from '../public/src/app/receipt-directory-writer.mjs';

const receipt = {
  receiptId: 'rec_1234567890abcdef12345678',
  packetId: 'mob-03a-part-b',
  reviewerDisplayName: 'Gazmend Abazi',
};

function writableFixture({ writeError = false } = {}) {
  const calls = { picker: 0, files: [], writes: [], closes: 0 };
  const directory = {
    async getFileHandle(name, options) {
      calls.files.push({ name, options });
      return {
        async createWritable() {
          return {
            async write(value) {
              if (writeError) throw new Error('disk');
              calls.writes.push(value);
            },
            async close() {
              calls.closes += 1;
            },
          };
        },
      };
    },
  };
  const pickDirectory = async options => {
    calls.picker += 1;
    calls.options = options;
    return directory;
  };
  return { calls, pickDirectory };
}

test('writes canonical receipt JSON and reuses the selected folder in this session', async () => {
  const fixture = writableFixture();
  const writer = createReceiptDirectoryWriter({ pickDirectory: fixture.pickDirectory });
  assert.equal(writer.supported, true);
  assert.equal((await writer.save(receipt)).ok, true);
  assert.equal((await writer.save(receipt)).ok, true);
  assert.equal(fixture.calls.picker, 1);
  assert.deepEqual(fixture.calls.options, {
    id: 'interdomestik-reviewer-receipts',
    mode: 'readwrite',
  });
  assert.deepEqual(fixture.calls.files, [
    { name: `${receipt.receiptId}.json`, options: { create: true } },
    { name: `${receipt.receiptId}.json`, options: { create: true } },
  ]);
  assert.deepEqual(fixture.calls.writes, [canonicalStringify(receipt), canonicalStringify(receipt)]);
  assert.equal(fixture.calls.closes, 2);
});

test('requests a directory again for each sequential submission', async () => {
  const fixture = writableFixture();
  const writer = createReceiptDirectoryWriter({ pickDirectory: fixture.pickDirectory });
  assert.equal((await writer.requestDirectory()).ok, true);
  assert.equal((await writer.requestDirectory()).ok, true);
  assert.equal(fixture.calls.picker, 2);
});

test('reports unsupported browsers without attempting a write', async () => {
  const writer = createReceiptDirectoryWriter({ pickDirectory: undefined });
  assert.equal(writer.supported, false);
  const result = await writer.save(receipt);
  assert.equal(result.code, 'unsupported');
  assert.match(result.message, /Eksporto JSON/);
});

test('shares one pending directory picker across concurrent requests', async () => {
  const fixture = writableFixture();
  let release;
  const pending = new Promise(resolve => {
    release = resolve;
  });
  const writer = createReceiptDirectoryWriter({
    pickDirectory: async options => {
      await pending;
      return fixture.pickDirectory(options);
    },
  });
  const first = writer.requestDirectory();
  const second = writer.requestDirectory();
  release();
  assert.equal((await first).ok, true);
  assert.equal((await second).ok, true);
  assert.equal(fixture.calls.picker, 1);
});

test('clears a stale directory while a fresh request is pending or cancelled', async () => {
  let calls = 0;
  let cancel;
  const firstFixture = writableFixture();
  const retryFixture = writableFixture();
  const pending = new Promise((resolve, reject) => {
    cancel = reject;
  });
  const writer = createReceiptDirectoryWriter({
    pickDirectory: async options => {
      calls += 1;
      if (calls === 1) return firstFixture.pickDirectory(options);
      if (calls === 2) return pending;
      return retryFixture.pickDirectory(options);
    },
  });
  assert.equal((await writer.requestDirectory()).ok, true);
  const freshRequest = writer.requestDirectory();
  const pendingSave = writer.save(receipt);
  cancel(new DOMException('cancelled', 'AbortError'));
  assert.equal((await freshRequest).code, 'cancelled');
  assert.equal((await pendingSave).code, 'cancelled');
  assert.equal(firstFixture.calls.files.length, 0);
  assert.equal((await writer.save(receipt)).ok, true);
  assert.equal(retryFixture.calls.files.length, 1);
  assert.equal(calls, 3);
});

test('rejects an unsafe receipt id before opening the picker', async () => {
  const fixture = writableFixture();
  const result = await createReceiptDirectoryWriter({ pickDirectory: fixture.pickDirectory }).save({
    ...receipt,
    receiptId: '../receipt',
  });
  assert.equal(result.code, 'invalid_data');
  assert.equal(fixture.calls.picker, 0);
});

test('rejects a non-string receipt id before coercion or picker access', async () => {
  const fixture = writableFixture();
  const result = await createReceiptDirectoryWriter({ pickDirectory: fixture.pickDirectory }).save({
    ...receipt,
    receiptId: { toString: () => receipt.receiptId },
  });
  assert.equal(result.code, 'invalid_data');
  assert.equal(fixture.calls.picker, 0);
});

test('reports write failures without claiming success', async () => {
  const fixture = writableFixture({ writeError: true });
  const result = await createReceiptDirectoryWriter({ pickDirectory: fixture.pickDirectory }).save(
    receipt
  );
  assert.equal(result.code, 'write_failed');
  assert.equal(fixture.calls.closes, 0);
});
