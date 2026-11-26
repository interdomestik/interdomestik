// The owner-reviewed WP-07 edge, measured on 7a461f277 → cc2b4f444.
// Keep this record in the statically loaded protected guard source.

import { LEGACY } from './manifest.mjs';
import { sha256 } from './rules-digest.mjs';
import { SCHEMA_DIR } from './schema-builder-imports.mjs';

export const RATE_BOOK_TRANSITION = `{
  "entries": {
    "packages/database/src/tenant.ts#withTenantContext": [
      "v2:c3d8fa551ce25d180eb3fdd6e11fe3404afe610399906ae1b886e0d04b4c9d92",
      "v2:1fab1703fa89a899d065e2ab4209ae8d570223b4547d149b6ae45ec7aa143e09"
    ],
    "packages/database/src/tenant.ts#withTenantDb": [
      "v2:df7e8287f619d59a19019cf31bb8b4f84f704e621426be49c13ad802ad65bb2b",
      "v2:8617bd1659c9f7b0fe7cb8a693de6803e27b3be20cc5484cec7e8b1544ff1304"
    ],
    "packages/database/src/db.ts#db": [
      "v2:b23fa89d98ebf20b378561b357c0c1d9aea4f7dffe0ada75aaf71e3dbaa365a4",
      "v2:46819dd3033b60db7041b47177df0a0cdd450ae34c31c92fae95dbcd195ed7ca"
    ]
  },
  "files": {
    "packages/database/src/schema/exchange-rates.ts": [
      "809b67f4954d2fd99a781c3881862a54b823ecbf59405ecf2aa625bbd5ffe748",
      "cd53b06f3a58c3a6011516c0e26ce3e57fd6a07897206803ad02d88ea62f0d75"
    ],
    "packages/database/src/schema/exchange-rate-verifications.ts": [
      "a29629fffe5839c926050ac30b75398514ccb23e9a4357763d59f7c256dde000",
      "f1c9ef383d687983891a52954c037ca7ef88b2d2afa46c5c578787fe28fda8eb"
    ],
    "packages/database/src/schema/exchange-rate-checks.ts": [
      null,
      "d44a7e1537faaaab2185ff45c35c61a3b6390c0bf3fdcccefb47433ef23c27c1"
    ],
    "packages/database/src/schema/index.ts": [
      "34251261af8bf1d30bcc52edf61bef4cfa2d3184f9a067cbf86108bc466ebe85",
      "0c939bac420979fef5b20b95aa800f59a2ba613ae4644c645d56a1475d357c8d"
    ]
  },
  "import": [
    "packages/database/src/schema/exchange-rate-verifications.ts",
    "./exchange-rate-checks",
    "packages/database/src/schema/exchange-rate-checks.ts"
  ]
}`;

const RATES = `${SCHEMA_DIR}exchange-rates.ts`;
const VERIFICATIONS = `${SCHEMA_DIR}exchange-rate-verifications.ts`;
const CHECKS = `${SCHEMA_DIR}exchange-rate-checks.ts`;
const BARREL = `${SCHEMA_DIR}index.ts`;
const INBOUND = `${SCHEMA_DIR}claim-inbound-documents.ts`;
const INBOUND_EXPORT = "export * from './claim-inbound-documents';\n";
const FILES = [RATES, VERIFICATIONS, CHECKS, BARREL];
const IMPORT = [VERIFICATIONS, './exchange-rate-checks', CHECKS];
const V2 = /^v2:[a-f0-9]{64}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const matches = (value, pattern) => typeof value === 'string' && pattern.test(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const keysAre = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const pair = (value, before, after) =>
  Array.isArray(value) &&
  value.length === 2 &&
  value[0] !== value[1] &&
  before(value[0]) &&
  after(value[1]);

// The dark WP-12.1 continuation binds the complete kernel tuple, including resolved edges.
// The W record supplies the unchanged rate files and the exact prefix of the new barrel.
export const INBOUND_TRANSITION = `{
  "entries": {
    "packages/database/src/tenant.ts#withTenantContext": "v2:716fb33d032f9501720dec5f8cc0582e60c80661ec1e1454c9a79e27c14d62e9",
    "packages/database/src/tenant.ts#withTenantDb": "v2:776dbb415a8e6407ad8feeefdf5b9b2c0c9dfc03b35b55dd1c52db31efde5fe0",
    "packages/database/src/db.ts#db": "v2:c7c3640d4316b625e72b9b6c0b4d0d249e28e470687ebc9814b9099a2a95d1a3"
  },
  "files": {
    "packages/database/src/schema/index.ts": "c09de18298d038bbd503a1ee7e5af2ef805bb9d18c8e6d1f38f99874ff03ff3f",
    "packages/database/src/schema/claim-inbound-documents.ts": "fe3c8c00114a9353a03f35c76dd088ff8da9c8f0dd6b1273d4cd22f012d20cec"
  }
}`;

export function parseRateBookTransition(text) {
  if (text == null) return { reason: 'missing rate-book transition record' };
  if (typeof text !== 'string') return { reason: 'unparseable rate-book transition record' };
  if (!text.trim()) return { reason: 'empty rate-book transition record' };
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    return { reason: 'unparseable rate-book transition record' };
  }
  const entries = [...LEGACY.keys()];
  const digest = value => matches(value, V2);
  const hash = value => matches(value, HASH);
  if (
    !keysAre(record, ['entries', 'files', 'import']) ||
    !keysAre(record.entries, entries) ||
    !entries.every(key => pair(record.entries[key], digest, digest)) ||
    !keysAre(record.files, FILES) ||
    !FILES.every(file =>
      pair(record.files[file], file === CHECKS ? value => value === null : hash, hash)
    ) ||
    !same(record.import, IMPORT)
  )
    return { reason: 'invalid rate-book transition record' };
  return record;
}

export function isRateBookImport(edge, [, specifier, target]) {
  return same(edge, [specifier, [target], null, false]);
}

export function parseInboundTransition(text) {
  if (text == null) return { reason: 'missing inbound schema transition record' };
  if (typeof text !== 'string') return { reason: 'unparseable inbound schema transition record' };
  if (!text.trim()) return { reason: 'empty inbound schema transition record' };
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    return { reason: 'unparseable inbound schema transition record' };
  }
  if (
    !keysAre(record, ['entries', 'files']) ||
    !keysAre(record.entries, [...LEGACY.keys()]) ||
    !Object.values(record.entries).every(value => matches(value, V2)) ||
    !keysAre(record.files, [BARREL, INBOUND]) ||
    !Object.values(record.files).every(value => matches(value, HASH))
  )
    return { reason: 'invalid inbound schema transition record' };
  return record;
}

function matchesFile(tree, file, hash) {
  if (hash === null) return !tree.files.has(file);
  const text = tree.sources.get(file);
  return text !== undefined && sha256(text) === hash;
}

function matchesImport(tree, record, count) {
  return [...tree.walks.values()].every(walk => {
    const edges = walk.resolutions.get(record.import[0]);
    return edges && edges.filter(edge => isRateBookImport(edge, record.import)).length === count;
  });
}

function matchesRateBook(tree, record, side) {
  return (
    [...tree.walks].every(([key, walk]) => walk.versioned === record.entries[key][side]) &&
    FILES.every(file => matchesFile(tree, file, record.files[file][side])) &&
    matchesImport(tree, record, side)
  );
}

export function schemaTransitionImage(tree, rateBook, inbound) {
  const barrel = tree.sources.get(BARREL);
  if (tree.files.has(INBOUND) || barrel.includes('./claim-inbound-documents')) {
    const exact =
      [...tree.walks].every(([key, walk]) => walk.versioned === inbound.entries[key]) &&
      Object.entries(inbound.files).every(([file, hash]) => matchesFile(tree, file, hash)) &&
      barrel.endsWith(INBOUND_EXPORT) &&
      sha256(barrel.slice(0, -INBOUND_EXPORT.length)) === rateBook.files[BARREL][1] &&
      [RATES, VERIFICATIONS, CHECKS].every(file =>
        matchesFile(tree, file, rateBook.files[file][1])
      ) &&
      matchesImport(tree, rateBook, 1);
    return exact ? 'inbound' : 'partial inbound';
  }
  if (matchesRateBook(tree, rateBook, 1)) return 'rate book';
  return matchesRateBook(tree, rateBook, 0) ? 'predecessor' : null;
}

export function inboundSequenceProblem(before, after, accumulated) {
  if (before === 'partial inbound' || after === 'partial inbound')
    return 'partial or changed inbound schema image';
  if (accumulated) return null;
  if (after === 'inbound' && before !== 'rate book' && before !== 'inbound')
    return 'inbound schema requires the exact rate-book base';
  return null;
}

export function rateBookTransition(before, after, accumulated, record) {
  // Accumulated proof reuses the WP-07 exceptions through the exact D image. W → D itself
  // goes through the ordinary proof, with every retained module held byte-identical.
  const applies = accumulated
    ? after === 'rate book' || after === 'inbound'
    : before === 'predecessor' && after === 'rate book';
  if (!applies) return null;
  return {
    import: record.import,
    retainedChanges: new Set([RATES, VERIFICATIONS]),
    checks: CHECKS,
  };
}
