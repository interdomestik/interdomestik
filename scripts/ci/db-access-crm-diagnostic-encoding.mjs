import { createHash } from 'node:crypto';
import { crmDigest, failCrm } from './db-access-crm-proof-shape.mjs';

// DESIGN DECISION pending scoped review: a decoder-only resource bound on the expanded compact
// canonical JSON (canonicalCrm + JSON.stringify, UTF-8 bytes; not Prettier output). It admits
// nothing and is not a policy cap; shard count, shard bytes and source limits are unchanged.
export const CRM_DIAGNOSTIC_EXPANSION_LIMIT = 64 * 1024 * 1024;
export const CRM_DIAGNOSTIC_SERIALIZATION = 'canonicalCrm-JSON.stringify-utf8-compact';
const SOURCE_LIMIT = 2048; // every file must be a bound source; mirrors the finite source closure
const PHASES = [
  'diagnostics.v1.meta',
  'diagnostics.v1.files',
  'diagnostics.v1.reasons',
  'diagnostics.v1.caseSets',
  'diagnostics.v1.rows',
];
const META_KEYS =
  'counts,expandedCanonicalJsonSha256,expandedCanonicalJsonUtf8Bytes,expandedCrmDigest,serialization,version';
const COUNT_KEYS = 'caseSets,files,reasons,rows';

const shaped = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === keys;

function text(value, label) {
  if (typeof value !== 'string') failCrm('invalid ' + label);
  return value;
}

function caseSetKey(item) {
  if (!Array.isArray(item) || !item.length) failCrm('invalid diagnostic case mapping');
  for (const id of item) {
    text(id, 'diagnostic case mapping');
    if (!/^crm-[a-z0-9-]+$/u.test(id)) failCrm('invalid diagnostic case mapping');
  }
  if (new Set(item).size !== item.length) failCrm('invalid diagnostic case mapping');
  return JSON.stringify(item);
}

function readMeta(value) {
  if (!shaped(value, META_KEYS) || !shaped(value.counts, COUNT_KEYS))
    failCrm('diagnostic metadata shape');
  if (value.version !== 1) failCrm('diagnostic encoding version');
  if (value.serialization !== CRM_DIAGNOSTIC_SERIALIZATION) failCrm('diagnostic serialization');
  const { files, reasons, caseSets, rows } = value.counts;
  const need = [0, files, reasons, caseSets, rows];
  if (
    need.slice(1).some(n => !Number.isSafeInteger(n) || n < 1) ||
    files > SOURCE_LIMIT ||
    files > rows ||
    reasons > rows ||
    caseSets > rows
  )
    failCrm('diagnostic metadata counts');
  const bytes = value.expandedCanonicalJsonUtf8Bytes;
  if (!Number.isSafeInteger(bytes) || bytes < 2 || bytes > CRM_DIAGNOSTIC_EXPANSION_LIMIT)
    failCrm('diagnostic expansion limit');
  const sha256 = value.expandedCanonicalJsonSha256;
  if (
    typeof sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(sha256) ||
    typeof value.expandedCrmDigest !== 'string' ||
    !value.expandedCrmDigest
  )
    failCrm('diagnostic metadata digest');
  return { need, bytes, sha256, crmDigest: value.expandedCrmDigest };
}

// Accepts one contiguous run of authenticated v1 shards. Declared counts never size an
// allocation; full rows are built only by finish(), after counts, dictionary use, expanded
// bytes and the streamed hash all match. Logical equality is not producer identity.
export function createCrmDiagnosticDecoder() {
  const dictionaries = [[], [], []];
  const serialized = [[], [], []];
  const rowChunks = [];
  const hash = createHash('sha256').update('[');
  let meta;
  let used;
  let phase = 0;
  let position = -1;
  let count = 0;
  let previous;
  let bytes = 1;

  function enter(next) {
    if (next < phase) failCrm('diagnostic encoding phase order');
    if (next > phase + 1) failCrm('missing diagnostic phase');
    if (next === phase) return;
    if (phase > 0 && count !== meta.need[phase]) failCrm('diagnostic dictionary count');
    if (next === 4) used = dictionaries.map(items => new Uint8Array(items.length));
    phase = next;
    count = 0;
    previous = undefined;
  }

  function entry(kind, index) {
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      Object.is(index, -0) ||
      index >= dictionaries[kind].length
    )
      failCrm('diagnostic dictionary index');
    used[kind][index] = 1;
    return dictionaries[kind][index];
  }

  function dictionary(items) {
    for (const item of items) {
      const key = phase === 3 ? caseSetKey(item) : text(item, 'diagnostic string');
      if (previous !== undefined && !(previous < key)) failCrm('diagnostic dictionary order');
      previous = key;
      dictionaries[phase - 1].push(item);
      serialized[phase - 1].push(phase === 3 ? key : JSON.stringify(item));
      count += 1;
    }
  }

  function rows(items) {
    for (const row of items) {
      if (!Array.isArray(row) || row.length !== 4) failCrm('diagnostic row shape');
      entry(0, row[0]);
      entry(1, row[1]);
      const occurrences = row[2];
      entry(2, row[3]);
      if (!Number.isSafeInteger(occurrences) || occurrences < 1) failCrm('diagnostic occurrences');
      // Keys are written in canonicalCrm (sorted) order, so this is exactly the row's share of
      // JSON.stringify(canonicalCrm(rows)); only this temporary string is allocated per row.
      const values = [
        serialized[2][row[3]],
        serialized[0][row[0]],
        String(occurrences),
        serialized[1][row[1]],
      ];
      const added =
        Buffer.byteLength('{"caseIds":,"file":,"occurrences":,"reason":}', 'utf8') +
        values.reduce((sum, value) => sum + Buffer.byteLength(value, 'utf8'), 0) +
        (count ? 1 : 0);
      if (!Number.isSafeInteger(added) || added > meta.bytes - bytes - 1)
        failCrm('diagnostic expanded byte count');
      bytes += added;
      // Per-dictionary strings already fit authenticated input; preflight precedes this row copy.
      const piece =
        (count ? ',' : '') +
        '{"caseIds":' +
        values[0] +
        ',"file":' +
        values[1] +
        ',"occurrences":' +
        values[2] +
        ',"reason":' +
        values[3] +
        '}';
      hash.update(piece, 'utf8');
      count += 1;
    }
    rowChunks.push(items);
  }

  return {
    add(kind, value, at) {
      const next = PHASES.indexOf(kind);
      if (next < 0)
        failCrm(
          /^diagnostics\.v1\./u.test(kind)
            ? 'diagnostic encoding kind'
            : 'diagnostic encoding version'
        );
      if (!Number.isSafeInteger(at) || at < 0 || (position >= 0 && at !== position + 1))
        failCrm('diagnostic encoding contiguity');
      position = at;
      if (next === 0) {
        if (meta) failCrm('duplicate diagnostic metadata');
        meta = readMeta(value);
        return;
      }
      if (!meta) failCrm('missing diagnostic metadata');
      enter(next);
      if (!shaped(value, 'items,offset') || !Array.isArray(value.items) || !value.items.length)
        failCrm('diagnostic chunk shape');
      if (
        !Number.isSafeInteger(value.offset) ||
        Object.is(value.offset, -0) ||
        value.offset !== count
      )
        failCrm('diagnostic chunk offset');
      if (count + value.items.length > meta.need[phase]) failCrm('diagnostic chunk count');
      if (phase === 4) rows(value.items);
      else dictionary(value.items);
    },
    finish() {
      if (phase !== 4) failCrm('missing diagnostic phase');
      if (count !== meta.need[4]) failCrm('diagnostic row count');
      if (used.some(marks => marks.includes(0))) failCrm('unused diagnostic dictionary entry');
      if (bytes + 1 !== meta.bytes) failCrm('diagnostic expanded byte count');
      if (hash.update(']').digest('hex') !== meta.sha256)
        failCrm('diagnostic expanded canonical digest');
      const [files, reasons, caseSets] = dictionaries;
      const decoded = [];
      for (const items of rowChunks)
        for (const row of items)
          decoded.push({
            caseIds: caseSets[row[3]].slice(),
            file: files[row[0]],
            occurrences: row[2],
            reason: reasons[row[1]],
          });
      if (crmDigest(decoded) !== meta.crmDigest) failCrm('diagnostic expanded crm digest');
      return decoded;
    },
  };
}
