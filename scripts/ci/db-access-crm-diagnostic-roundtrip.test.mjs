import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DIAGNOSTIC_ROWS as ROWS,
  encodeDiagnostics,
  decodeDiagnostics,
} from './db-access-crm-diagnostic-encoding-fixture.mjs';
import { canonicalCrm, crmDigest } from './db-access-crm-proof-shape.mjs';
const valid = () => encodeDiagnostics(ROWS);
const meta = s => s[0].value;

test('decoder restores exact logical rows, order and crmDigest', () => {
  const s = valid();
  const rows = decodeDiagnostics(s);
  assert.deepEqual(rows, ROWS);
  assert.equal(crmDigest(rows), crmDigest(ROWS));
  assert.equal(
    Buffer.byteLength(JSON.stringify(canonicalCrm(rows))),
    meta(s).expandedCanonicalJsonUtf8Bytes
  );
});
test('decoder output is independent of chunking', () => {
  assert.deepEqual(
    decodeDiagnostics(encodeDiagnostics(ROWS, { size: 64 })),
    decodeDiagnostics(valid())
  );
});
test('decoded rows do not alias dictionary arrays', () => {
  const s = valid();
  const rows = decodeDiagnostics(s);
  assert.notEqual(rows[1].caseIds, rows[2].caseIds);
  assert.notEqual(rows[1].caseIds, s[5].value.items[0]);
});
test('expanded bytes are compact canonical JSON, not formatted output', () => {
  const formatted = Buffer.byteLength(JSON.stringify(canonicalCrm(ROWS), null, 2));
  assert.notEqual(meta(valid()).expandedCanonicalJsonUtf8Bytes, formatted);
});
test('codec preserves empty reasons and lone surrogates using exact JSON escaping', () => {
  const rows = [
    { file: 'apps/a.ts', reason: '', occurrences: 1, caseIds: ['crm-a'] },
    { file: 'apps/a.ts', reason: '\uD800', occurrences: 2, caseIds: ['crm-a'] },
  ];
  assert.deepEqual(decodeDiagnostics(encodeDiagnostics(rows)), rows);
});
