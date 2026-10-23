import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CRM_DIAGNOSTIC_EXPANSION_LIMIT,
  createCrmDiagnosticDecoder,
} from './db-access-crm-diagnostic-encoding.mjs';
import {
  DIAGNOSTIC_ROWS as ROWS,
  decodeDiagnostics,
  encodeDiagnostics,
} from './db-access-crm-diagnostic-encoding-fixture.mjs';

const valid = () => encodeDiagnostics(ROWS);
const meta = s => s[0].value;
const withKey = (value, key) => JSON.parse(JSON.stringify(value).replace('{', `{"${key}":0,`));

test('decoder rejects excess expansion while streaming, before finish allocates rows', () => {
  const s = valid();
  meta(s).expandedCanonicalJsonUtf8Bytes = 2;
  const decoder = createCrmDiagnosticDecoder();
  s.slice(0, 7).forEach((shard, i) => decoder.add(shard.kind, shard.value, i));
  assert.throws(() => decoder.add(s[7].kind, s[7].value, 7), /expanded byte count/u);
});
test('decoder refuses a non-contiguous encoded run', () => {
  const s = valid();
  assert.throws(
    () =>
      decodeDiagnostics(
        s,
        s.map((_, i) => (i < 5 ? i : i + 1))
      ),
    /contiguity/u
  );
});
for (const [kind, extra] of [
  ['files', ['zz.ts']],
  ['reasons', ['zz']],
  ['caseSets', [['crm-z']]],
])
  test('decoder refuses unused ' + kind + ' entry', () =>
    assert.throws(
      () => decodeDiagnostics(encodeDiagnostics(ROWS, { unused: { [kind]: extra } })),
      /unused diagnostic dictionary entry/u
    )
  );

const set = (i, items) => s => {
  s[i].value.items = items;
};
for (const [name, mutate, expected] of [
  [
    'extra metadata key',
    s => {
      meta(s).extra = 1;
    },
    /metadata shape/u,
  ],
  [
    'missing metadata key',
    s => {
      delete meta(s).expandedCrmDigest;
    },
    /metadata shape/u,
  ],
  [
    'own __proto__ metadata key',
    s => {
      s[0].value = withKey(meta(s), '__proto__');
    },
    /metadata shape/u,
  ],
  [
    'extra count key',
    s => {
      meta(s).counts.total = 3;
    },
    /metadata shape/u,
  ],
  [
    'unknown metadata version',
    s => {
      meta(s).version = 2;
    },
    /encoding version/u,
  ],
  [
    'mixed version shard kind',
    s => {
      s[7].kind = 'diagnostics.v2.rows';
    },
    /encoding version/u,
  ],
  [
    'unknown v1 shard kind',
    s => {
      s[7].kind = 'diagnostics.v1.columns';
    },
    /encoding kind/u,
  ],
  [
    'wrong serialization',
    s => {
      meta(s).serialization = 'prettier';
    },
    /serialization/u,
  ],
  ['missing metadata', s => s.slice(1), /missing diagnostic metadata/u],
  ['metadata not first', s => [...s.slice(1), s[0]], /missing diagnostic metadata/u],
  ['duplicate metadata', s => [s[0], s[0], ...s.slice(1)], /duplicate diagnostic metadata/u],
  ['metadata only', s => s.slice(0, 1), /missing diagnostic phase/u],
  [
    'zero declared rows',
    s => {
      meta(s).counts.rows = 0;
    },
    /metadata counts/u,
  ],
  [
    'fractional declared count',
    s => {
      meta(s).counts.files = 1.5;
    },
    /metadata counts/u,
  ],
  [
    'file count beyond source closure',
    s => {
      meta(s).counts.files = 2049;
    },
    /metadata counts/u,
  ],
  [
    'declared expansion beyond decoder limit',
    s => {
      meta(s).expandedCanonicalJsonUtf8Bytes = CRM_DIAGNOSTIC_EXPANSION_LIMIT + 1;
    },
    /expansion limit/u,
  ],
  [
    'malformed canonical sha256',
    s => {
      meta(s).expandedCanonicalJsonSha256 = 'A'.repeat(64);
    },
    /metadata digest/u,
  ],
  [
    'empty crm digest',
    s => {
      meta(s).expandedCrmDigest = '';
    },
    /metadata digest/u,
  ],
  ['skipped phase', s => [...s.slice(0, 5), ...s.slice(7)], /missing diagnostic phase/u],
  [
    'late dictionary chunk',
    s => [...s, { kind: 'diagnostics.v1.files', value: { offset: 2, items: ['apps/c.ts'] } }],
    /phase order/u,
  ],
  ['phase interleaving', s => [s[0], s[1], s[3], s[2], ...s.slice(4)], /dictionary count/u],
  ['missing rows phase', s => s.slice(0, 7), /missing diagnostic phase/u],
  ['truncated rows', s => s.slice(0, 9), /row count/u],
  [
    'offset gap',
    s => {
      s[2].value.offset = 2;
    },
    /chunk offset/u,
  ],
  [
    'offset overlap',
    s => {
      s[8].value.offset = 0;
    },
    /chunk offset/u,
  ],
  [
    'string offset',
    s => {
      s[2].value.offset = '1';
    },
    /chunk offset/u,
  ],
  ['chunk reordering', s => [...s.slice(0, 7), s[8], s[7], s[9]], /chunk offset/u],
  ['empty chunk', set(2, []), /chunk shape/u],
  [
    'extra chunk key',
    s => {
      s[2].value.version = 1;
    },
    /chunk shape/u,
  ],
  ['chunk beyond declared count', set(2, ['apps/b.ts', 'apps/c.ts']), /chunk count/u],
  [
    'dictionary out of order',
    s => {
      set(1, ['apps/b.ts'])(s);
      set(2, ['apps/a.ts'])(s);
    },
    /dictionary order/u,
  ],
  ['duplicate file entry', set(2, ['apps/a.ts']), /dictionary order/u],
  ['duplicate case set entry', set(6, [['crm-a']]), /dictionary order/u],
  ['non-string entry', set(1, [7]), /invalid diagnostic string/u],
  ['empty case set', set(5, [[]]), /case mapping/u],
  ['duplicate case id', set(6, [['crm-b', 'crm-b']]), /case mapping/u],
  ['non-string case id', set(6, [['crm-b', 1]]), /case mapping/u],
  ['case set not an array', set(5, ['crm-a']), /case mapping/u],
  ['short row tuple', set(7, [[1, 1, 2]]), /row shape/u],
  ['long row tuple', set(7, [[1, 1, 2, 1, 0]]), /row shape/u],
  ['object row', set(7, [ROWS[0]]), /row shape/u],
  ['index out of range', set(7, [[2, 1, 2, 1]]), /dictionary index/u],
  ['negative index', set(7, [[-1, 1, 2, 1]]), /dictionary index/u],
  ['negative zero index', set(8, [[-0, 0, 1, 0]]), /dictionary index/u],
  ['fractional index', set(7, [[0.5, 1, 2, 1]]), /dictionary index/u],
  ['string index', set(7, [['1', 1, 2, 1]]), /dictionary index/u],
  ['zero occurrences', set(7, [[1, 1, 0, 1]]), /occurrences/u],
  ['fractional occurrences', set(7, [[1, 1, 1.5, 1]]), /occurrences/u],
  ['unsafe occurrences', set(7, [[1, 1, 2 ** 53, 1]]), /occurrences/u],
  [
    'declared bytes too small',
    s => {
      meta(s).expandedCanonicalJsonUtf8Bytes -= 1;
    },
    /expanded byte count/u,
  ],
  [
    'declared bytes too large',
    s => {
      meta(s).expandedCanonicalJsonUtf8Bytes += 1;
    },
    /expanded byte count/u,
  ],
  [
    'wrong canonical sha256',
    s => {
      meta(s).expandedCanonicalJsonSha256 = '0'.repeat(64);
    },
    /expanded canonical digest/u,
  ],
  [
    'same-size value tamper',
    s => {
      set(7, [[1, 1, 3, 1]])(s);
      set(9, [[1, 0, 2, 0]])(s);
    },
    /expanded canonical digest/u,
  ],
  [
    'same-size row reordering',
    s => {
      set(8, [[1, 0, 3, 0]])(s);
      set(9, [[0, 0, 1, 0]])(s);
    },
    /expanded canonical digest/u,
  ],
  [
    'wrong crm digest',
    s => {
      meta(s).expandedCrmDigest = 'not-the-digest';
    },
    /expanded crm digest/u,
  ],
])
  test('decoder refuses ' + name, () => {
    const s = valid();
    const shards = mutate(s) ?? s;
    assert.throws(() => decodeDiagnostics(shards), expected);
  });
