import { createHash } from 'node:crypto';
import {
  CRM_DIAGNOSTIC_SERIALIZATION,
  createCrmDiagnosticDecoder,
} from './db-access-crm-diagnostic-encoding.mjs';
import { canonicalCrm, crmDigest } from './db-access-crm-proof-shape.mjs';

// Test-only reference encoder; not a producer and never imported by runtime code.
export const DIAGNOSTIC_ROWS = [
  { file: 'apps/b.ts', reason: 'raw "sql" \\ ✓', occurrences: 2, caseIds: ['crm-b', 'crm-a'] },
  { file: 'apps/a.ts', reason: 'dynamic\nquery 😀', occurrences: 1, caseIds: ['crm-a'] },
  { file: 'apps/b.ts', reason: 'dynamic\nquery 😀', occurrences: 3, caseIds: ['crm-a'] },
];

export function encodeDiagnostics(rows, { size = 1, unused = {} } = {}) {
  const sorted = (values, extra = []) => [...new Set([...values, ...extra])].sort();
  const files = sorted(
    rows.map(row => row.file),
    unused.files
  );
  const reasons = sorted(
    rows.map(row => row.reason),
    unused.reasons
  );
  const setKeys = sorted(
    rows.map(row => JSON.stringify(row.caseIds)),
    unused.caseSets?.map(set => JSON.stringify(set))
  );
  const json = JSON.stringify(canonicalCrm(rows));
  const chunks = (kind, items) => {
    const out = [];
    for (let offset = 0; offset < items.length; offset += size)
      out.push({
        kind: 'diagnostics.v1.' + kind,
        value: { offset, items: items.slice(offset, offset + size) },
      });
    return out;
  };
  const tuples = rows.map(row => [
    files.indexOf(row.file),
    reasons.indexOf(row.reason),
    row.occurrences,
    setKeys.indexOf(JSON.stringify(row.caseIds)),
  ]);
  const meta = {
    version: 1,
    serialization: CRM_DIAGNOSTIC_SERIALIZATION,
    counts: {
      files: files.length,
      reasons: reasons.length,
      caseSets: setKeys.length,
      rows: rows.length,
    },
    expandedCanonicalJsonUtf8Bytes: Buffer.byteLength(json),
    expandedCanonicalJsonSha256: createHash('sha256').update(json).digest('hex'),
    expandedCrmDigest: crmDigest(rows),
  };
  return [
    { kind: 'diagnostics.v1.meta', value: meta },
    ...chunks('files', files),
    ...chunks('reasons', reasons),
    ...chunks(
      'caseSets',
      setKeys.map(key => JSON.parse(key))
    ),
    ...chunks('rows', tuples),
  ];
}

export function decodeDiagnostics(shards, positions = shards.map((_, i) => i)) {
  const decoder = createCrmDiagnosticDecoder();
  shards.forEach((shard, i) => decoder.add(shard.kind, shard.value, positions[i]));
  return decoder.finish();
}
