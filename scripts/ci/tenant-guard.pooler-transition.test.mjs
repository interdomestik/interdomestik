import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DB_TRANSACTION_POOLER } from './tenant-guard/c1-admissions-pooler.mjs';
import { LEGACY_PINS } from './tenant-guard/manifest.mjs';
import { createModuleGraph } from './tenant-guard/modules.mjs';
import { installAdmission } from './tenant-guard/rules-admission.mjs';
import { installTrust } from './tenant-guard/rules-trust.mjs';
import { APP_ALIASES, currentSources, workspacePackages } from './tenant-guard/sources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const current = new Map(
  [...currentSources(root)].filter(([file]) => file.startsWith('packages/database/'))
);
const packages = workspacePackages(root);
const DB = 'packages/database/src/db.ts';
const MODE = 'packages/database/src/pooler-mode.ts';

// Keep exact successor bytes in data-only fixtures so the guard PR has no runtime change.
// The fixed predecessor commit remains available after either side of the transition merges.
const sources = new Map(current);
sources.set(
  DB,
  execFileSync(
    '/usr/bin/git',
    ['show', '7e114c2eeee83453331f5a1d5082f716d5cf1c9c:packages/database/src/db.ts'],
    { cwd: root, encoding: 'utf8' }
  )
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

test('the predecessor remains pinned while the pooler admission stays inactive', () => {
  const ctx = trust(sources);
  for (const [key, pins] of LEGACY_PINS) {
    assert.equal(ctx.legacyPinned(key), true, key);
    assert.equal(ctx.legacyDigest(key), pins[0]);
  }
  assert.equal(ctx.telemetry.c1Admissions, 0);
});

test('the checked-out kernel is exactly one reviewed side of the transition', () => {
  const expected = current.has(MODE) ? successor : sources;
  for (const file of [DB, MODE]) assert.equal(current.get(file), expected.get(file), file);
  for (const key of LEGACY_PINS.keys()) assert.equal(trust(current).legacyPinned(key), true, key);
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
