// Shared fixtures for the additive schema admission tests.

import assert from 'node:assert/strict';
import { KERNEL_ANCHOR, LEGACY } from './tenant-guard/manifest.mjs';
import { bundlerClosure } from './tenant-guard/bundler-closure.mjs';
import { resolverPair, resolverTransition } from './tenant-guard/rules-resolver-state.mjs';
import { kernelAnchorPins } from './tenant-guard/rules-schema-admission.mjs';
import { evaluate } from './tenant-guard/rules.mjs';
import { readSchemaTree, schemaTreeFromBlobs } from './tenant-guard/sources.mjs';
import { KERNEL } from './tenant-guard-test-support.mjs';

const ROOT = new URL('../../', import.meta.url);
const DB = 'packages/database/src/db.ts';
const TENANT = 'packages/database/src/tenant.ts';
const LIFETIME = 'packages/database/src/transaction-lifetime.ts';
const SCHEMA = 'packages/database/src/schema.ts';
const INDEX = 'packages/database/src/index.ts';
const BARREL = 'packages/database/src/schema/index.ts';
const OLD = 'packages/database/src/schema/users.ts';
const SECOND = 'packages/database/src/schema/accounts.ts';
const NEW = 'packages/database/src/schema/rates.ts';
const NEW_EXPORT = "export * from './rates';\n";
const CALLER = 'apps/web/src/read.ts';
const BUILDERS = "import { pgTable, text } from 'drizzle-orm/pg-core';\n";
const table = (name = 'rates', physical = name) =>
  `${BUILDERS}export const ${name} = pgTable('${physical}', { id: text('id') });\n`;
const original = {
  ...KERNEL,
  [DB]: `import './schema';\nimport './transaction-lifetime';\n${KERNEL[DB]}`,
  [LIFETIME]: 'export const lifetime = 1;\n',
  [SCHEMA]: "export * from './schema/index';\n",
  [BARREL]: "export * from './users';\nexport * from './accounts';\n",
  [OLD]: table('users'),
  [SECOND]: `${table('accounts')}import { users } from './users';\nexport const retain = users;\n`,
  [CALLER]:
    "import { db } from '@interdomestik/database/db';\nexport const ping = () => db.select();\n",
};
const checkedIn = readSchemaTree(ROOT, KERNEL_ANCHOR, 'anchor');
// Resolver inputs plus the checked-in bundler closure, so fixtures carry a bindable closure.
const inputBlobs = [
  ...[...checkedIn.inputs].map(([file]) => [file, checkedIn.blobs.get(file)]),
  ...bundlerClosure(checkedIn).value.files.map(([file]) => [file, checkedIn.allSources.get(file)]),
];

/** A resolver record whose baseline is `base`, optionally with the exact transition to `next`. */
function recordFor(base, next = null) {
  const baseline = resolverPair(base);
  assert.equal(baseline.reason, undefined, baseline.reason);
  if (next === null) return { baseline, successor: null };
  const successor = resolverTransition(base, next, 'fixture');
  assert.equal(successor.reason, undefined, successor.reason);
  return { baseline, successor };
}

function snapshot(changes = {}) {
  const blobs = new Map([...inputBlobs, ...Object.entries({ ...original, ...changes })]);
  for (const [file, value] of blobs) if (value === null) blobs.delete(file);
  return schemaTreeFromBlobs(blobs);
}

const initial = snapshot();
const append = (changes = {}) =>
  snapshot({ [BARREL]: original[BARREL] + NEW_EXPORT, [NEW]: table(), ...changes });
function scan(
  candidate,
  {
    anchor = initial,
    base = initial,
    sourceView = candidate,
    legacyPins = kernelAnchorPins(initial),
    resolverRecord = recordFor(base ?? initial),
  } = {}
) {
  return evaluate({
    sources: sourceView.sources,
    graph: sourceView.graph,
    trusted: initial.sources,
    contracts: [],
    legacyPins,
    schemaAdmission: { anchor, base, candidate },
    resolverRecord,
  });
}

function refuses(result, reason, { c1 = true } = {}) {
  assert.equal(result.schemaAdmission.reason, reason);
  assert.equal(result.schemaAdmission.ok, false);
  assert.deepEqual(result.legacyDigests, result.legacyExactDigests);
  const pins = result.violations.filter(finding => finding.rule === 'pin');
  assert.equal(pins.length, LEGACY.size);
  for (const { detail } of pins) assert.ok(detail.includes(reason), detail);
  if (c1)
    assert.ok(
      result.violations.some(
        finding =>
          finding.rule === 'C1' &&
          finding.file === CALLER &&
          /depends on changed code \(db\)/u.test(finding.detail)
      ),
      JSON.stringify(result.violations)
    );
}

export { BARREL, BUILDERS, DB, INDEX, LIFETIME, NEW, NEW_EXPORT, OLD, SCHEMA, TENANT };
export { append, initial, original, recordFor, refuses, scan, snapshot, table };

// Reviewed digests used by the historical schema admission replay suite.
export const CURRENT_TUPLE = [
  'd5a48cd0122819d13b21c018aa2728d7f675de0d2306b379fbc21330ffe7b5d9',
  '7a219887513dba5ff0b88241b9926b13c010d51ceaee7a020e4ab1f8dfb2d988',
  '3cbacb145c83aa637e232999b07dd4f10131ba23dec5dc62282c8f5e0a1ad671',
];
export const ACQ_TUPLE = [
  [
    '97650c0c5409095be3aedf0c68ecd4bde4bb898a9264b892f2d61a6bff691e37',
    '92e239c86942fe9c17d22826b9e0c64ed0e132f2e57d1408e26289988ccc16eb',
  ],
  [
    '0a9dacf96cfdce1a57a728efee7b3a723802f8cc5fd8a8c6346eabea33597f8f',
    '40c646fcae0b203d0337dbb0e5ceb46091f2403cf9f89f6065878d4c504c76e7',
  ],
  [
    'f6030648819e130f965138672b666c115e78791f5997a6395069e7adcbda8d92',
    '93c5c961056320a272ed82e9e5cc8822715a76ce4b79bc53e8d7ab7f14fb74df',
  ],
];
export const WP_SUCCESSOR = [
  '1d75e1be9ef39be8b7e1fd522f5f62d5e34479a67d2b61af5d6c0d9985ff5c60',
  '692e1867c412c7d42112590cbea6a94d11a6e8d0a0832427204bf19cfcf29ba9',
  '66891cd8aa8f554c2bb6c95204833b02a6b47b756d137db25f4bca9abf2b66ed',
];
export const PRE_CUTOVER_V2 = [
  'v2:cd510b832702e29d8fa20a134032be27c071ce90544137cf18df2f42378f4602',
  'v2:e3667d8a8207b7689dd1ab9cd1d54185aa54eade9186abe908888631d4cc8739',
  'v2:96900df444bd7d695798af14354847399dc609f0470c1f24edae0a5f77ec782e',
];
