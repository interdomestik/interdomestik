// Shared fixtures for the additive schema admission tests.

import assert from 'node:assert/strict';
import { KERNEL_ANCHOR, LEGACY } from './tenant-guard/manifest.mjs';
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
const inputBlobs = [...checkedIn.inputs].map(([file]) => [file, checkedIn.blobs.get(file)]);

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
  } = {}
) {
  return evaluate({
    sources: sourceView.sources,
    graph: sourceView.graph,
    trusted: initial.sources,
    contracts: [],
    legacyPins,
    schemaAdmission: { anchor, base, candidate },
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
export { append, initial, original, refuses, scan, snapshot, table };
