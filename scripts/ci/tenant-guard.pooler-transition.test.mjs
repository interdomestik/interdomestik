import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DB_TRANSACTION_POOLER } from './tenant-guard/c1-admissions-pooler.mjs';
import { LEGACY } from './tenant-guard/manifest.mjs';
import { createModuleGraph } from './tenant-guard/modules.mjs';
import { installAdmission } from './tenant-guard/rules-admission.mjs';
import { installTrust } from './tenant-guard/rules-trust.mjs';
import { APP_ALIASES, currentSources, SOURCE, workspacePackages } from './tenant-guard/sources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const current = new Map(
  [...currentSources(root)].filter(([file]) => file.startsWith('packages/database/'))
);
const packages = workspacePackages(root);
const DB = 'packages/database/src/db.ts';
const MODE = 'packages/database/src/pooler-mode.ts';
const PREDECESSOR = '7e114c2eeee83453331f5a1d5082f716d5cf1c9c';

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

// Keep exact successor bytes in data-only fixtures so the guard PR has no runtime change.
// The fixed predecessor commit remains available after either side of the transition merges.
const sources = new Map(current);
sources.set(
  DB,
  execFileSync('/usr/bin/git', ['show', `${PREDECESSOR}:${DB}`], { cwd: root, encoding: 'utf8' })
);
sources.delete(MODE);
const successor = new Map(sources);
for (const file of [DB, MODE]) {
  successor.set(
    file,
    readFileSync(
      new URL(`./tests/fixtures/pooler-transition/${path.basename(file)}.txt`, import.meta.url),
      'utf8'
    )
  );
}

function trust(candidate, legacyPins = LEGACY_PINS) {
  const ctx = {
    graph: createModuleGraph({ sources: candidate, packages, appAliases: APP_ALIASES }),
    trusted: sources,
    legacyPins,
    pinnedModules: new Set(),
    telemetry: {},
  };
  installTrust(ctx);
  installAdmission(ctx, [DB_TRANSACTION_POOLER]);
  return ctx;
}

const TENANT = 'packages/database/src/tenant.ts';
const previousPins = new Map([
  [
    `${TENANT}#withTenantContext`,
    '92e239c86942fe9c17d22826b9e0c64ed0e132f2e57d1408e26289988ccc16eb',
  ],
  [`${TENANT}#withTenantDb`, '40c646fcae0b203d0337dbb0e5ceb46091f2403cf9f89f6065878d4c504c76e7'],
  [`${DB}#db`, '93c5c961056320a272ed82e9e5cc8822715a76ce4b79bc53e8d7ab7f14fb74df'],
]);

test('the pre-pooler predecessor is now refused', () => {
  const git = args => execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8' });
  const files = git(['ls-tree', '-r', '--name-only', '-z', PREDECESSOR, '--', 'packages/database/'])
    .split('\0')
    .filter(file => SOURCE.test(file));
  const predecessor = new Map(files.map(file => [file, git(['show', `${PREDECESSOR}:${file}`])]));
  const ctx = trust(predecessor);
  for (const key of previousPins.keys()) {
    const digest = ctx.legacyDigest(key);
    const pins = LEGACY_PINS.get(key);
    assert.equal(ctx.legacyPinned(key), false, key);
    assert.ok(!pins.includes(digest), key);
    assert.equal(digest, previousPins.get(key), key);
  }
  assert.equal(ctx.telemetry.c1Admissions, 0);
});

test('the checked-out kernel is exactly one reviewed side of the transition', () => {
  const expected = current.has(MODE) ? successor : sources;
  for (const file of [DB, MODE]) assert.equal(current.get(file), expected.get(file), file);
  for (const key of LEGACY_PINS.keys()) assert.equal(trust(current).legacyPinned(key), true, key);
});

test('predecessor-only pins refuse the exact pooler successor', () => {
  const ctx = trust(successor, previousPins);
  for (const key of LEGACY_PINS.keys()) assert.equal(ctx.legacyPinned(key), false, key);
});

test('the reviewed pooler kernel binds all three legacy entries and the helper import', () => {
  const ctx = trust(current);
  const pooler = trust(successor);
  const expectedPins = [
    [
      `${TENANT}#withTenantContext`,
      'd5a48cd0122819d13b21c018aa2728d7f675de0d2306b379fbc21330ffe7b5d9',
      '1d75e1be9ef39be8b7e1fd522f5f62d5e34479a67d2b61af5d6c0d9985ff5c60',
    ],
    [
      `${TENANT}#withTenantDb`,
      '7a219887513dba5ff0b88241b9926b13c010d51ceaee7a020e4ab1f8dfb2d988',
      '692e1867c412c7d42112590cbea6a94d11a6e8d0a0832427204bf19cfcf29ba9',
    ],
    [
      `${DB}#db`,
      '3cbacb145c83aa637e232999b07dd4f10131ba23dec5dc62282c8f5e0a1ad671',
      '66891cd8aa8f554c2bb6c95204833b02a6b47b756d137db25f4bca9abf2b66ed',
    ],
  ];
  for (const [key, mainDigest, pr1aDigest] of expectedPins) {
    const pins = LEGACY_PINS.get(key);
    assert.ok(pins, key);
    assert.equal(pooler.legacyPinned(key), true, key);
    assert.ok(pins.includes(ctx.legacyDigest(key)), key);
    assert.equal(pins.length, 2, `${key} pin count`);
    assert.equal(pins[0], mainDigest, `${key} main digest`);
    assert.equal(pins[1], pr1aDigest, `${key} PR-1a digest`);
    assert.equal(pooler.legacyDigest(key), ctx.legacyDigest(key), 'matches the checked-out kernel');
  }
  assert.equal(pooler.pinnedModules.has(DB), true);
  assert.equal(pooler.pinnedModules.has(MODE), true);
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
