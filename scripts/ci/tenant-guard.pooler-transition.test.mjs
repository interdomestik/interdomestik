import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { git, rootDir, tmp, writeFile } from './db-access-required-git.mjs';

import { DB_TRANSACTION_POOLER } from './tenant-guard/c1-admissions-pooler.mjs';
import { LEGACY } from './tenant-guard/manifest.mjs';
import { createModuleGraph } from './tenant-guard/modules.mjs';
import { installAdmission } from './tenant-guard/rules-admission.mjs';
import { installTrust } from './tenant-guard/rules-trust.mjs';
import { APP_ALIASES, readSchemaTree } from './tenant-guard/sources.mjs';

const predecessor = readSchemaTree(
  rootDir,
  {
    commit: '7e114c2eeee83453331f5a1d5082f716d5cf1c9c',
    tree: '53bf5f79859c86e8bf80e236e9a03bf067643f99',
  },
  'historical pooler predecessor'
);
const postimage = readSchemaTree(
  rootDir,
  {
    commit: '68fbe0aeeb961bf163355b198ac84841e99a5675',
    tree: '61cd6ab8be28f3a0277db4d90619f7f7dd5d5212',
  },
  'historical pooler successor'
);
const sources = predecessor.sources;
const successor = postimage.sources;
const DB = 'packages/database/src/db.ts';
const MODE = 'packages/database/src/pooler-mode.ts';

// Owner-reviewed v1 predecessor and successor preserve the historical pooler contract.
const POOLER_TUPLE = [
  [
    '92e239c86942fe9c17d22826b9e0c64ed0e132f2e57d1408e26289988ccc16eb',
    'd5a48cd0122819d13b21c018aa2728d7f675de0d2306b379fbc21330ffe7b5d9',
  ],
  [
    '40c646fcae0b203d0337dbb0e5ceb46091f2403cf9f89f6065878d4c504c76e7',
    '7a219887513dba5ff0b88241b9926b13c010d51ceaee7a020e4ab1f8dfb2d988',
  ],
  [
    '93c5c961056320a272ed82e9e5cc8822715a76ce4b79bc53e8d7ab7f14fb74df',
    '3cbacb145c83aa637e232999b07dd4f10131ba23dec5dc62282c8f5e0a1ad671',
  ],
];
const LEGACY_PINS = new Map(
  [...LEGACY.keys()].map((key, index) => [key, Object.freeze(POOLER_TUPLE[index])])
);

function trust(candidate, legacyPins = LEGACY_PINS, tree = postimage) {
  const ctx = {
    graph: createModuleGraph({
      sources: candidate,
      packages: tree.packages,
      appAliases: APP_ALIASES,
      resolution: tree.resolution,
    }),
    trusted: sources,
    legacyPins,
    pinnedModules: new Set(),
    telemetry: {},
  };
  installTrust(ctx);
  installAdmission(ctx, [DB_TRANSACTION_POOLER]);
  return ctx;
}

test('the predecessor remains pinned while the pooler admission stays inactive', () => {
  const ctx = trust(sources, LEGACY_PINS, predecessor);
  for (const [key, pins] of LEGACY_PINS) {
    assert.equal(ctx.legacyPinned(key), true, key);
    assert.equal(ctx.legacyDigest(key), pins[0]);
  }
  assert.equal(ctx.telemetry.c1Admissions, 0);
});

test('the historical pooler successor matches the reviewed byte fixtures', () => {
  for (const file of [DB, MODE]) {
    const expected = readFileSync(
      new URL(`./tests/fixtures/pooler-transition/${path.basename(file)}.txt`, import.meta.url),
      'utf8'
    );
    assert.equal(successor.get(file), expected, file);
  }
  for (const key of LEGACY_PINS.keys()) assert.equal(trust(successor).legacyPinned(key), true, key);
});

test('historical pooler proofs still pass after a table append in the working tree', () => {
  const checkout = tmp('pooler-appended-checkout');
  const entry = 'scripts/ci/tenant-guard.pooler-transition.test.mjs';
  git(checkout, 'init', '-q');
  const objects = git(rootDir, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  writeFile(checkout, '.git/objects/info/alternates', `${path.join(objects, 'objects')}\n`);
  for (const file of [
    entry,
    'scripts/ci/db-access-required-git.mjs',
    'scripts/ci/verification-evidence/worker-profile.mjs',
    'scripts/ci/tenant-guard',
    'scripts/ci/tests/fixtures/pooler-transition',
    'packages/database/src',
    'packages/database/package.json',
  ]) {
    const destination = path.join(checkout, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(rootDir, file), destination, { recursive: true });
  }
  symlinkSync(path.join(rootDir, 'node_modules'), path.join(checkout, 'node_modules'));
  const schema = 'packages/database/src/schema';
  const barrel = `${schema}/index.ts`;
  writeFile(
    checkout,
    barrel,
    `${readFileSync(path.join(checkout, barrel), 'utf8')}export * from './pooler-test-table';\n`
  );
  writeFile(checkout, `${schema}/pooler-test-table.ts`, [
    "import { pgTable, text } from 'drizzle-orm/pg-core';",
    "export const poolerTestTable = pgTable('pooler_test_table', { id: text('id') });",
  ]);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-reporter=tap',
      '--test-name-pattern=^(the |predecessor-only|drift |an unresolved|one changed)',
      entry,
    ],
    { cwd: checkout, env, encoding: 'utf8' }
  );
  assert.equal(run.status, 0, `${run.stderr}\n${run.stdout}`);
  assert.match(run.stdout, /# pass 8\b/u);
});

test('predecessor-only pins refuse the exact pooler successor', () => {
  const previousPins = new Map([...LEGACY_PINS].map(([key, pins]) => [key, pins[0]]));
  const ctx = trust(successor, previousPins);
  for (const key of LEGACY_PINS.keys()) assert.equal(ctx.legacyPinned(key), false, key);
});

test('the reviewed pooler kernel binds all three legacy entries and the helper import', () => {
  const ctx = trust(successor);
  for (const [key, pins] of LEGACY_PINS) {
    assert.equal(ctx.legacyPinned(key), true, key);
    assert.equal(ctx.legacyDigest(key), pins[1], 'matches the successor in the transition pair');
  }
  assert.equal(ctx.pinnedModules.has(DB), true);
  assert.equal(ctx.pinnedModules.has(MODE), true);
});

test('drift in either pooler file refuses every legacy kernel entry', () => {
  for (const file of [DB, MODE]) {
    const drifted = new Map(successor);
    drifted.set(file, `${drifted.get(file)}\n// unreviewed drift\n`);
    const ctx = trust(drifted);
    for (const key of LEGACY_PINS.keys()) assert.equal(ctx.legacyPinned(key), false, key);
  }
});

test('an unresolved pooler helper import cannot inherit the reviewed pins', () => {
  const missing = new Map(successor);
  missing.delete(MODE);
  const ctx = trust(missing);
  for (const key of LEGACY_PINS.keys()) {
    assert.equal(ctx.legacyPinned(key), false, key);
    assert.match(
      ctx.legacyClosureProblems.get(key).join('\n'),
      /unresolved import \.\/pooler-mode/u
    );
  }
});

test('the complete C1 bundle admits only the two configuration units and no sink edges', () => {
  const ctx = trust(successor);
  assert.equal(ctx.telemetry.c1Admissions, 1);
  for (const [file, name] of [
    [DB, 'createQueryClient'],
    [MODE, 'isTransactionPooler'],
  ]) {
    const fact = ctx.factsOf(file);
    assert.equal(ctx.c1Admitted(fact, fact.declarations.get(name)), true);
    assert.equal(ctx.c1AdmittedEdge(fact, fact.declarations.get(name), `${DB}#db`), false);
  }
  const fact = ctx.factsOf(DB);
  const assertion = fact.declarations.get('assertRlsConnectionRoleReady');
  assert.equal(ctx.c1Admitted(fact, assertion), false);
});

test('one changed byte or a missing helper deactivates the whole C1 bundle', () => {
  for (const file of [DB, MODE]) {
    const drifted = new Map(successor);
    drifted.set(file, `${drifted.get(file)} `);
    assert.equal(trust(drifted).telemetry.c1Admissions, 0);
  }
  const missing = new Map(successor);
  missing.delete(MODE);
  assert.equal(trust(missing).telemetry.c1Admissions, 0);
});
