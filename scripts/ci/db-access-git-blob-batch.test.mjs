import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeGitBlobBatch, gitBlobBatchRequest } from './db-access-git-blob-batch.mjs';

const a = 'a'.repeat(40),
  b = 'b'.repeat(40);
const record = (oid, bytes) =>
  Buffer.concat([Buffer.from(oid + ' blob ' + bytes.length + '\n'), bytes, Buffer.from('\n')]);
test('binary, embedded LF/NUL and empty payloads preserve exact bytes and requested order', () => {
  const payload = Buffer.from([0, 10, 255, 13, 0]);
  const decoded = decodeGitBlobBatch(
    Buffer.concat([record(a, payload), record(b, Buffer.alloc(0))]),
    [a, b]
  );
  assert.deepEqual([...decoded.keys()], [a, b]);
  assert.deepEqual(decoded.get(a), payload);
  assert.deepEqual(decoded.get(b), Buffer.alloc(0));
  assert.deepEqual(gitBlobBatchRequest([a, b]), Buffer.from(a + '\n' + b + '\n'));
});
test('empty requests have no output or fabricated record', () => {
  assert.equal(gitBlobBatchRequest([]).length, 0);
  assert.equal(decodeGitBlobBatch(Buffer.alloc(0), []).size, 0);
  assert.throws(() => decodeGitBlobBatch(Buffer.from('\n'), []), /Git blob batch/u);
});
for (const [name, output, expected = [a, b]] of [
  ['missing', Buffer.from(a + ' missing\n'), [a]],
  ['nonblob', Buffer.from(a + ' tree 0\n\n'), [a]],
  ['reordered', Buffer.concat([record(b, Buffer.alloc(0)), record(a, Buffer.alloc(0))])],
  ['duplicate', Buffer.concat([record(a, Buffer.alloc(0)), record(a, Buffer.alloc(0))])],
  ['truncated payload', Buffer.from(a + ' blob 4\nx\n'), [a]],
  ['missing payload terminator', Buffer.from(a + ' blob 0\n'), [a]],
  ['noncanonical length', Buffer.from(a + ' blob 00\n\n'), [a]],
  ['unsafe length', Buffer.from(a + ' blob 9007199254740992\n\n'), [a]],
  [
    'wrong payload terminator',
    Buffer.concat([Buffer.from(a + ' blob 0\nX'), record(b, Buffer.alloc(0))]),
  ],
  [
    'extra record',
    Buffer.concat([
      record(a, Buffer.alloc(0)),
      record(b, Buffer.alloc(0)),
      record(a, Buffer.alloc(0)),
    ]),
  ],
  [
    'trailing bytes',
    Buffer.concat([record(a, Buffer.alloc(0)), record(b, Buffer.alloc(0)), Buffer.from('x')]),
  ],
])
  test(name + ' refuses the complete batch', () =>
    assert.throws(() => decodeGitBlobBatch(output, expected), /Git blob batch/u)
  );
test('duplicate, invalid and excessive requests and nonbinary output refuse', () => {
  for (const oids of [
    [a, a],
    ['HEAD'],
    ['A'.repeat(40)],
    Array.from({ length: 4097 }, (_, i) => i.toString(16).padStart(40, '0')),
  ])
    assert.throws(() => gitBlobBatchRequest(oids), /Git blob batch/u);
  assert.throws(() => decodeGitBlobBatch(a + ' blob 0\n\n', [a]), /Git blob batch/u);
  assert.throws(
    () => decodeGitBlobBatch(Buffer.alloc(32 * 1024 * 1024 + 1), []),
    /Git blob batch/u
  );
});
