import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { hash } from './db-access-provider-runtime-identity.mjs';
import { validateCrmContract } from './db-access-crm-proof-shape.mjs';
import { logicalFixture, materializeContract } from './db-access-crm-wire-contract-fixture.mjs';
import { wireFixture, WIRE_INDEX } from './db-access-crm-wire-fixture.mjs';
import {
  encodeDiagnostics,
  decodeDiagnostics,
} from './db-access-crm-diagnostic-encoding-fixture.mjs';

for (const target of ['index', 'shard']) {
  test('authenticated wire rejects missing physical ' + target, t => {
    const f = wireFixture(t);
    fs.unlinkSync(path.join(f.root, target === 'index' ? WIRE_INDEX : f.files[0]));
    assert.throws(f.run, /ambiguous input/u);
  });
  test('authenticated wire rejects case-confusable ' + target, t => {
    const f = wireFixture(t);
    const file = target === 'index' ? WIRE_INDEX : f.files[0];
    fs.renameSync(
      path.join(f.root, file),
      path.join(f.root, file.replace('db-access', 'DB-access'))
    );
    assert.throws(f.run, /ambiguous input/u);
  });
}
test('authenticated shard enforces exact 128KiB boundary', t => {
  for (const bytes of [131072, 131073]) {
    const f = wireFixture(t);
    const file = f.files[0];
    // Loader transport boundary only: this padding is not a valid source descriptor.
    const value = { kind: 'sources', value: { padding: '' } };
    value.value.padding = 'x'.repeat(bytes - Buffer.byteLength(JSON.stringify(value)));
    const raw = JSON.stringify(value);
    assert.equal(Buffer.byteLength(raw), bytes);
    fs.writeFileSync(path.join(f.root, file), raw);
    f.policy.producerFiles[file] = { bytes, sha256: hash(raw), mode: '100644' };
    if (bytes === 131072) assert.equal(f.run().sources.padding, value.value.padding);
    else assert.throws(f.run, /file byte budget/u);
  }
});
test('decoder preserves 2048 distinct file entries and refuses 2049', () => {
  const rows = Array.from({ length: 2049 }, (_, i) => ({
    file: `fixture-${String(i).padStart(4, '0')}.ts`,
    reason: 'synthetic boundary',
    occurrences: 12,
    caseIds: ['crm-fixture'],
  }));
  const atLimit = rows.slice(0, 2048);
  assert.deepEqual(decodeDiagnostics(encodeDiagnostics(atLimit, { size: 128 })), atLimit);
  assert.throws(
    () => decodeDiagnostics(encodeDiagnostics(rows, { size: 128 })),
    /metadata counts/u
  );
});
test('unchanged shape validator retains 2048-source bound after valid decoding', t => {
  const logical = logicalFixture();
  const decoded = materializeContract(t, logical.contract, true).run();
  // Shape boundary only: these extra bindings are not authenticated runtime closure.
  const descriptor = decoded.sources['fixture.ts'];
  for (let i = 1; i < 2048; i++) decoded.sources[`extra-${i}.ts`] = { ...descriptor };
  assert.equal(Object.keys(decoded.sources).length, 2048);
  assert.equal(validateCrmContract(decoded).size, 1);
  decoded.sources['one-over.ts'] = { ...descriptor };
  assert.throws(() => validateCrmContract(decoded), /finite source closure/u);
});
test('wire rejects a forged descriptor digest before reconstruction', t => {
  const f = wireFixture(t);
  f.policy.producerFiles[f.files[0]].sha256 = '0'.repeat(64);
  assert.throws(f.run, /input identity/u);
});

test('decoder rejects negative-zero dictionary offset', () => {
  const rows = [{ file: 'a.ts', reason: 'fixed', occurrences: 1, caseIds: ['crm-a'] }];
  const shards = encodeDiagnostics(rows);
  shards[1].value.offset = -0;
  assert.throws(() => decodeDiagnostics(shards), /chunk offset/u);
});
test('decoder rejects a syntactically invalid string case ID', () => {
  const rows = [{ file: 'a.ts', reason: 'fixed', occurrences: 1, caseIds: ['CRM-A'] }];
  assert.throws(() => decodeDiagnostics(encodeDiagnostics(rows)), /case mapping/u);
});
test('dictionary ordering uses code units rather than locale collation', () => {
  const rows = ['a', 'Z'].map(file => ({
    file,
    reason: 'fixed',
    occurrences: 1,
    caseIds: ['crm-a'],
  }));
  const shards = encodeDiagnostics(rows, { size: 8 });
  assert.deepEqual(shards[1].value.items, ['Z', 'a']);
  assert.deepEqual(decodeDiagnostics(shards), rows);
  shards[1].value.items.reverse();
  assert.throws(() => decodeDiagnostics(shards), /dictionary order/u);
});
