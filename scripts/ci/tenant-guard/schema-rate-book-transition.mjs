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
const FILES = [RATES, VERIFICATIONS, CHECKS, `${SCHEMA_DIR}index.ts`];
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

function matchesImage(tree, record, side) {
  if ([...tree.walks].some(([key, walk]) => walk.versioned !== record.entries[key][side]))
    return false;
  for (const [file, hashes] of Object.entries(record.files)) {
    const hash = hashes[side];
    const text = tree.sources.get(file);
    if (hash === null ? tree.files.has(file) : text === undefined || sha256(text) !== hash)
      return false;
  }
  return [...tree.walks.values()].every(walk => {
    const edges = walk.resolutions.get(record.import[0]);
    return edges && edges.filter(edge => isRateBookImport(edge, record.import)).length === side;
  });
}

export function rateBookTransition(before, after, accumulated, record) {
  // The protected base may already carry the exact successor. Crossing to it in a candidate
  // requires the complete predecessor. An ordinary comparison still runs in both cases.
  if (!matchesImage(after, record, 1) || (!accumulated && !matchesImage(before, record, 0)))
    return null;
  return {
    import: record.import,
    retainedChanges: new Set([RATES, VERIFICATIONS]),
    checks: CHECKS,
  };
}
