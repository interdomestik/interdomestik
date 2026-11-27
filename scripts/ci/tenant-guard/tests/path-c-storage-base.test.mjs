import assert from 'node:assert/strict';
import test from 'node:test';
import { installAdmission } from '../rules-admission.mjs';
import { sha256 } from '../rules-digest.mjs';
import { MIGRATION_JOURNAL, RECEIPT_SQL } from '../storage-receipt-prerequisite.mjs';
import {
  INBOUND,
  READER,
  checkStorageAdmission as check,
  dark,
  edit,
  journal,
  journalEntry,
  predecessorReceiptSql,
  readerChanges,
  storage,
  wp07,
} from './path-c-test-support.mjs';

function checkBothRefused(result) {
  assert.equal(result.reader, false);
  assert.equal(result.receipt, null, JSON.stringify(result.violations));
}

const readerBaseRefusal = /storage reader requires exact WP-12.1 schema and 0114/u;
const receiptBaseRefusal = /storage receipt requires exact WP-12.1 schema and 0114/u;
const has = ({ violations }, pattern) => violations.some(({ detail }) => pattern.test(detail));

test('the exact B reader on W is refused even though the W schema passes', () => {
  const result = check(wp07, edit(wp07, readerChanges));
  assert.equal(result.proof.ok, true, result.proof.reason);
  checkBothRefused(result);
  assert.equal(result.violations.length, 1);
  assert.ok(has(result, readerBaseRefusal));
});

test('exact D+B on W cannot satisfy its own first-parent prerequisite', () => {
  const result = check(wp07, storage);
  assert.equal(result.proof.ok, true, result.proof.reason);
  checkBothRefused(result);
  assert.ok(has(result, readerBaseRefusal));
  assert.ok(has(result, receiptBaseRefusal));
});

test('D on W passes with the staff-draft reader and the verifier dormant', () => {
  const result = check(wp07, dark);
  assert.equal(result.proof.ok, true, result.proof.reason);
  checkBothRefused(result);
  assert.deepEqual(result.violations, []);
  const ctx = { graph: dark.graph, schemaAdmission: result.proof, telemetry: {}, violations: [] };
  installAdmission(ctx);
  const unit = dark.graph
    .sourceFileOf(READER)
    .statements.find(node => node.name?.text === 'readLocalDocumentAccess');
  assert.ok(unit);
  assert.equal(
    ctx.c1Admitted(
      {
        file: READER,
        sourceFile: unit.getSourceFile(),
        declarations: new Map([[unit.name.text, unit]]),
      },
      unit
    ),
    true
  );
});

test('the previously admitted 0114 on the protected base withholds both permissions', () => {
  assert.equal(
    sha256(predecessorReceiptSql),
    '23a5749235d0a82d5d337762bc715e5ebe23181ec5cf256b3d16b59bee18042a'
  );
  const base = edit(dark, [[RECEIPT_SQL, predecessorReceiptSql]]);
  const result = check(base, storage);
  assert.equal(result.proof.ok, true, result.proof.reason);
  checkBothRefused(result);
  assert.ok(has(result, readerBaseRefusal));
  assert.ok(has(result, receiptBaseRefusal));
});

for (const [label, changes] of [
  ['partial D', [[INBOUND, null]]],
  ['missing 0114 SQL', [[RECEIPT_SQL, null]]],
  ['empty 0114 SQL', [[RECEIPT_SQL, '']]],
  ['one-byte change in 0114 SQL', [[RECEIPT_SQL, `${dark.blobs.get(RECEIPT_SQL)} `]]],
  ['missing journal', [[MIGRATION_JOURNAL, null]]],
  ['empty journal', [[MIGRATION_JOURNAL, '']]],
  ['malformed journal', [[MIGRATION_JOURNAL, '{"entries":']]],
  ['missing 0114 journal entry', [[MIGRATION_JOURNAL, journal()]]],
  [
    'altered 0114 journal entry',
    [[MIGRATION_JOURNAL, journal({ ...journalEntry, when: journalEntry.when + 1 })]],
  ],
  [
    'duplicate 0114 tag',
    [[MIGRATION_JOURNAL, journal(journalEntry, { ...journalEntry, idx: 115 })]],
  ],
  [
    'duplicate 0114 index',
    [[MIGRATION_JOURNAL, journal(journalEntry, { ...journalEntry, tag: '0114_wrong' })]],
  ],
]) {
  test(`${label} on the first parent withholds both permissions from an exact B candidate`, () => {
    const result = check(edit(dark, changes), storage);
    checkBothRefused(result);
    assert.ok(has(result, readerBaseRefusal));
    assert.ok(has(result, receiptBaseRefusal));
  });
}
